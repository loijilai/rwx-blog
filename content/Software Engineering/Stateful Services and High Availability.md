---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#HA 的核心思考|HA 的核心思考]]
> - [[#Stateless Tier HA|Stateless Tier HA]]
>   - [[#Stateless Tier 跨 AZ 的基本結構|Stateless Tier 跨 AZ 的基本結構]]
>   - [[#Multiple EC2 Instances Migration Concurrency|Multiple EC2 Instances Migration Concurrency]]
> - [[#RDS Availability|RDS Availability]]
>   - [[#RDS Multi-AZ 不是兩個都能寫的 Database|RDS Multi-AZ 不是兩個都能寫的 Database]]
>   - [[#Multi-AZ Standby 與 Read Replica|Multi-AZ Standby 與 Read Replica]]
>   - [[#為什麼 Single-AZ RDS 仍需要跨 AZ 的 DB Subnet Group？|為什麼 Single-AZ RDS 仍需要跨 AZ 的 DB Subnet Group？]]
> - [[#Redis Availability|Redis Availability]]
> - [[#NAT Gateway 是 SPOF，其他 HA 還有意義嗎？|NAT Gateway 是 SPOF，其他 HA 還有意義嗎？]]
> - [[#目前的 Deliberate Single Points of Failure|目前的 Deliberate Single Points of Failure]]
>   - [[#可以處理 Stateless Tier HA|可以處理 Stateless Tier HA]]
>   - [[#無法處理|無法處理]]

![[aws-infra.svg]]

這篇整理 Durable Queue 如何思考 high availability：哪些元件可以被替換、哪些元件保存狀態，以及目前的架構真正能承受哪些 failure。

# HA 的核心思考

HA 的核心不是資源數量，而是：

1. Critical path 上有哪些元件？
2. 每個元件故障時的 blast radius 是什麼？
3. 狀態是否能恢復？
4. 系統是否有另一個可用入口？

```text
User request critical path
→ ALB
→ API
→ RDS / Redis
```

只把 API instances 放到多個 AZ，不能讓整個系統承受 AZ failure。如果 RDS 或 Redis 仍固定在單一 AZ，stateful tier 依然是整體可用性的上限。

# Stateless Tier HA

- ALB
- Django API instances
- Celery worker instances

## Stateless Tier 跨 AZ 的基本結構

```text
AZ A                         AZ B
├─ public-subnet-a           ├─ public-subnet-b
└─ private-subnet-a          └─ private-subnet-b
```

ALB 和 ASG 使用多個 subnets，把入口與 compute 分散到不同 AZ。但 database 和 queue 是否具備跨 AZ 能力，仍要獨立設定。

## Multiple EC2 Instances Migration Concurrency

EC2 開機後，兩個 migrate 同時跑，會有問題嗎？

在 PostgreSQL + Django 預設 `atomic=True` 的情況下，一個 migration file 內的多個 DDL，例如 `ALTER TABLE`、`CREATE INDEX` 等，通常都會包在同一個 DB transaction 裡，這稱作 transaction DDL。

> 但是：Process 內部的 transaction != 跨 process 的 distributed lock

### 這不處理會有什麼問題嗎？

- **好消息**:Postgres 是 **transactional DDL**。撞爛的那台會**乾淨 rollback**,schema 不會半套。(換成 MySQL 就沒這保障 —— DDL 隱式 commit,真的會留下半套 schema。)
- **壞消息**:`CREATE TABLE` / `ALTER TABLE` 會拿 **ACCESS EXCLUSIVE lock**,第二台被第一台擋住等 → 等到第一台 commit 後,第二台用**開機時就算好的舊 plan** 去 `CREATE` 同一張表 → `relation already exists` → migrate exit 非零 → **gunicorn 根本沒起來,那台開機失敗**。

所以這個 race 在你的 stack 上,後果不是「資料壞掉」,是「**不確定的開機失敗 / flaky deploy**」

正確解法：部署流程中只安排一個 migrator

```
CI/CD
  │
  ├─ 1. 執行一次 migrate
  │
  └─ 2. 更新 ASG / 部署 API instances
             ├─ API 1：只啟動 Gunicorn
             └─ API 2：只啟動 Gunicorn
```

# RDS Availability
## RDS Multi-AZ 不是兩個都能寫的 Database

> Q: 如果在兩個AZ，讓RDS變成兩份，這樣user不是會取得不一致的state嗎？

如果兩個 databases 都能獨立寫入，確實會遇到 state inconsistency。RDS Multi-AZ 的典型模型不是兩個 active writers，而是 single writer + standby：

```text
        單一 endpoint（一個 DNS 名字）
                 │  所有讀寫都打這裡
                 ▼
   ┌─────────────────────┐        同步複製         ┌─────────────────────┐
   │  PRIMARY (AZ-a)      │ ───────────────────▶ │  STANDBY (AZ-c)      │
   │  唯一接受讀寫的       │                        │  熱備份，平時不服務   │
   └─────────────────────┘                        └─────────────────────┘
```

重要特性：

1. 永遠只有一個 primary 接受寫入。
2. Standby 平時不處理 application traffic。
3. Client 永遠使用同一個 endpoint。
4. Primary 故障後，AWS 將 standby 升為 primary，endpoint 不需要改變。

Availability 增加了，但寫入仍維持 single-writer model。

## Multi-AZ Standby 與 Read Replica

Multi-AZ Standby 別跟另一個東西搞混：read replica

「RDS 可以有多個副本分攤讀取」是 **read replica**，是**不同工具、解不同問題**：

|             | Multi-AZ Standby   | Read Replica                               |
| ----------- | ------------------ | ------------------------------------------ |
| 目的          | High availability  | Read scaling                               |
| Replication | 同步                 | 通常非同步                                      |
| 平時服務讀取      | 否                  | 是                                          |
| 是否可能讀到舊資料   | Client 不會讀 standby | 可能有 replication lag (eventual consistency) |

> 補充：ElastiCache Redis 也是 primary+replica 類似結構，只是它的複製是非同步、failover 可能掉幾筆

> 名詞解釋：Standby 也是 replica，但不是 read replica。`replica` 描述的是「它是副本」；`standby` 和 `read replica` 描述的是「這份副本被拿來做什麼」。

## 為什麼 Single-AZ RDS 仍需要跨 AZ 的 DB Subnet Group？

DB Subnet Group 定義的是 RDS 可以放置 database instance 的候選 subnets，不是目前建立了幾台 database。

```
VPC
├─ private subnet A（AZ-a）
├─ private subnet C（AZ-c）
└─ DB subnet group
   ├─ subnet A
   └─ subnet C
```

RDS 會從候選 subnets 中選擇位置。跨 AZ 的 subnet group 也為 maintenance、failover 或未來啟用 Multi-AZ 提供可用範圍。

# Redis Availability

目前 Redis 是 single node，因此也是 single point of failure。Production 可以使用 replication group，透過 primary + replica 提高 availability。

Redis replication 通常是 asynchronous，failover 時可能遺失少量尚未複製的資料（但我沒做，所以沒有討論）。對 broker 的影響，需要和 task acknowledgement、visibility timeout 與 redelivery 設計一起評估。

# NAT Gateway 是 SPOF，其他 HA 還有意義嗎？

有，因為不同元件的 blast radius 不同。

```text
正在處理的 user request
→ ALB
→ API
→ RDS / Redis
```

這條路徑不經 NAT。單一 NAT failure 主要影響 private instances 主動對外的流量，例如：

- 新 instance pull image
- 呼叫外部 API
- OS update

| SPOF | 影響 | 位於核心 request path？ |
|---|---|---|
| RDS | Application state 無法讀寫 | 是 |
| Redis | Queue / broker 無法使用 | 視 request 功能而定 |
| NAT | Internet egress 中斷 | 否 |

接受單一 NAT 是一個成本取捨，不代表其他 HA 設計失去意義。

# 目前的 Deliberate Single Points of Failure

這是一個 cost-scoped demo，因此 stateful edges 刻意保留單點：

- **RDS**：`multi_az = false`。Production 會使用 Multi-AZ standby。
- **Redis**：single node。Production 會使用 replication group。
- **NAT**：single gateway。Production 會在每個 AZ 建立 NAT。

## 可以處理 Stateless Tier HA

- 單一 API instance crash。
- 單一 worker instance crash。
- ASG 中某台 EC2 的 hardware failure。
- 某次 deployment 只破壞部分 stateless instances。

## 無法處理

- RDS 所在 AZ 完整故障。
- Redis 所在 AZ 完整故障。
- Stateful data loss。
- 完整 Region failure。

因此目前取得的是 instance-level resilience，不是完整的 AZ-level high availability。
