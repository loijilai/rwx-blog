---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#ALB 與 API Gateway 的責任|ALB 與 API Gateway 的責任]]
> - [[#Django 不是 Web Server|Django 不是 Web Server]]
> - [[#Gunicorn 為什麼使用 Multi-process？|Gunicorn 為什麼使用 Multi-process？]]
> - [[#ALB + target group + health check|ALB + target group + health check]]
>   - [[#Host Header 是什麼？|Host Header 是什麼？]]
>   - [[#Virtual Hosting|Virtual Hosting]]
>   - [[#Forward Proxy 與 Reverse Proxy|Forward Proxy 與 Reverse Proxy]]
>   - [[#NAT 是 forward proxy 嗎？|NAT 是 forward proxy 嗎？]]
>   - [[#Django ALLOWED_HOSTS|Django ALLOWED_HOSTS]]
>   - [[#Health Check Design|Health Check Design]]
> - [[#Appendix|Appendix]]
>   - [[#Password Reset Poisoning|Password Reset Poisoning]]

這篇整理一個 HTTP request 從使用者進入 AWS，到 Django application 回應之前，依序經過哪些元件，以及每一層的責任。

# ALB 與 API Gateway 的責任

```text
ALB
重點：水平擴展、負載平衡、網路入口、健康檢查

API Gateway
重點：Cross-cutting concerns、API 管理、JWT 驗證、限流、API Key、usage plan
```

目前 Durable Queue 的後端是長時間運作的 EC2 instances，需要的是 health check 和 load balancing，因此先使用 ALB。

```text
公開 Django API
  ↓
多台長時間運作的 EC2
  ↓
需要 health check 與 load balancing
  ↓
使用 ALB
  ↓
未來若出現第三方 API Key、quota、usage plan
  ↓
再考慮 API Gateway + internal ALB
```

# Django 不是 Web Server

```text
Client
  ↓ HTTP
OS TCP/IP stack
  ↓
Gunicorn
  ↓ WSGI
Django
```

```shell
gunicorn durable_queue.wsgi:application --bind 0.0.0.0:8000
```

這個 command 可以拆成三部分：

1. `gunicorn`：請 OS 啟動 Gunicorn executable。
2. `durable_queue.wsgi:application`：import `durable_queue.wsgi`，取得 `application` 物件。
3. `--bind 0.0.0.0:8000`：在所有 IPv4 network interfaces 的 port 8000 監聽。

Gunicorn 底層大致執行：

```text
socket()
bind(("0.0.0.0", 8000))
listen()
accept()
```

Gunicorn 是真正站在 OS socket 前接收 HTTP request 的 server；Django 是被 Gunicorn 呼叫來處理 request 的 Python application。

# Gunicorn 為什麼使用 Multi-process？

```text
一台機器 / 一個 container
  ↓
Gunicorn master
  ↓ fork
多個 worker processes
  ↓
每個 worker 載入一份 Django
```

Gunicorn 預設的 sync worker，一個 worker 同時間通常處理一個 request。Multi-process 的主要效果是：

1. 不同 process 各有 Python interpreter 與 GIL，可以使用多個 CPU cores。
2. Worker 之間有較好的故障隔離。
3. 記憶體與 process state 彼此隔離。

一般 Django request 很多是 I/O-bound，例如等待 database、Redis 或外部 API；thread 仍可能有效提高 concurrency。GIL 不代表 thread 完全沒有用途，詳細內容見 [[Python thread 有用嗎？]]。


# ALB + target group + health check

## Host Header 是什麼？

HTTP/1.1 request 包含 `Host`：

```http
GET /api/products HTTP/1.1
Host: api.example.com
```

`Host` 表示 client 想存取哪個網站。它讓同一個 IP 和 port 可以服務不同 domains：

```text
同一個 reverse proxy:443
  ├─ Host: example.com → Website A
  └─ Host: shop.com    → Website B
```

為什麼會有這個機制？

## Virtual Hosting
同一個 IP + 同一個 port，可以靠 HTTP Host header 分辨不同網站。以前沒有 Host header 就真的是一個 ip + port 就是一個網站。

## Forward Proxy 與 Reverse Proxy

Forward proxy 站在使用者這邊：

```text
Client → Forward Proxy → Internet
```

網站看到的通常是 proxy 的 IP，而不是你的真實 IP。例子：公司限制員工能瀏覽哪些網站

Reverse proxy 站在 server 這邊：

```text
Client → Reverse Proxy → Backend 1 / Backend 2
```

ALB 是 reverse proxy：client 只知道 ALB，不知道真正處理 request 的 EC2。
常見例子：Nginx、AWS ALB、Kubernetes Ingress，功能是：Load balancing、TLS termination、隱藏後端 server、路由不同服務。

## NAT 是 forward proxy 嗎？

NAT 不是 forward proxy。NAT 在 network / transport layer 改寫 IP 與 port；proxy 會終止 application-layer connection，再建立另一條連線。

|               | NAT                       | Forward Proxy            |
| ------------- | ------------------------- | ------------------------ |
| 工作層級          | Network / Transport layer | Application layer        |
| 是否理解 HTTP     | 通常不理解                     | 理解 HTTP、HTTPS 等協定        |
| Client 是否明確知道 | 通常不知道                     | 通常需要設定 proxy             |
| 主要工作          | 改寫 IP / Port              | 代表 client 發出應用層請求        |
| 能否過濾 URL      | 通常不行                      | 可以                       |
| 能否快取網頁        | 不行                        | 可以                       |
| 差異            | 只是改封包地址，還是同一個封包           | 終止 client 的連線，再自己建立另一條連線 |

## Django `ALLOWED_HOSTS`

Django 會檢查 request 的 `Host` 是否在 `ALLOWED_HOSTS` 中，避免 application 過度相信攻擊者控制的 Host header。

```python
if request.headers["Host"] not in ALLOWED_HOSTS:
    return 400 Bad Request
```

典型風險是 password reset poisoning：application 使用不可信的 Host header 產生 reset URL，可能把 token 寄往攻擊者控制的 domain。

### User Request 與 ALB Health Check 的 Host 不同

Q: 使用者 request 和 ALB health check 打到 EC2 時，Host header 一樣嗎？

使用者的情況，ALB 通常會保留原本 Host：

```
GET /api/products HTTP/1.1
Host: api.example.com
```

ALB 自己產生的 health check，會自己組 HTTP request。

通常 Host 會是：

```
Host: target-private-ip:port
```

問題點：**private IP 是會變的**。你在 ASG 底下，機器隨時被 scale/替換，新機器就是新的 private IP

> **「Host header 這道防線，在你的架構裡到底還需不需要它擋事？」**

目前架構中，API Security Group 只允許來自 ALB Security Group 的流量，因此使用 `ALLOWED_HOSTS = ["*"]` 的安全性，是建立在 EC2 無法被外部直接連線的網路邊界上。

若未來 EC2 可以被 Internet 直接存取，這個前提就不成立，`*` 也會重新成為風險。

## Health Check Design

給 ALB 的 health check 應保持 shallow，只證明 application process 能接 request。Database、Redis 等 dependency health 應由另外的 monitoring 檢查，不要讓它們直接決定 ALB 是否摘除 instance。

```text
Liveness
└─ Application process 是否活著？

Readiness / Dependency health
└─ Database、Redis、外部服務是否正常？
```

一句話記住：

> Liveness 給 ALB；dependency health 給 monitoring。

# Appendix

## Password Reset Poisoning

```
Host Header Attack（Password Reset Poisoning）

User 想重設密碼
        |
        v
+-------------------------+
| 1. User 輸入 email       |
|                         |
| POST /forgot-password    |
| email=alice@example.com |
+-------------------------+
        |
        v
Backend 產生 reset token
        |
        |
        |  原本應該：
        |  https://example.com/reset?token=abc123
        |
        v
+--------------------------------+
| Backend 組 reset URL （太相信送進來的 host)|
|                                |
| reset_url =                    |
| https://{request.get_host()}   |
| /reset?token=abc123             |
+--------------------------------+
        |
        |
        |  ⚠️ 問題：
        |  Backend 相信 Host header
        |
        |
        v
Server 產生錯誤 reset link 

https://attacker.com/reset?token=abc123

        |
        v
寄送 Email 給 Alice

+--------------------------------+
| Alice 收到信                   |
|                                |
| Click:                         |
| https://attacker.com/reset     |
| ?token=abc123                  |
+--------------------------------+
        |
        v
Alice 點擊連結
        |
        v
        
攻擊者取得 reset token

        |
        v
攻擊者呼叫真正網站，因為拿到 token （臨時密碼），所以可以改密碼

POST https://example.com/reset-password

{
  token: abc123,
  new_password: hacker123
}

        |
        v
+------------------------------+
| Account Takeover             |
|                              |
| 攻擊者控制 Alice 帳號        |
+------------------------------+
```
