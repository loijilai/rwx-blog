---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Networking terminology|Networking terminology]]
> - [[#Region、AZ、VPC 與 Subnet|Region、AZ、VPC 與 Subnet]]
>   - [[#資源的範圍|資源的範圍]]
> - [[#Route Table 與 Security Group 解決不同問題|Route Table 與 Security Group 解決不同問題]]
> - [[#Public Subnet 與 Private Subnet 差在哪裡？|Public Subnet 與 Private Subnet 差在哪裡？]]
>   - [[#Public Subnet|Public Subnet]]
>   - [[#Private Subnet|Private Subnet]]
>   - [[#Local Route|Local Route]]
> - [[#Ingress：使用者如何到達 API|Ingress：使用者如何到達 API]]
>   - [[#第一段：Internet 到 ALB|第一段：Internet 到 ALB]]
>   - [[#第二段：ALB 到 EC2|第二段：ALB 到 EC2]]
> - [[#Egress：Private EC2 如何連到 Internet|Egress：Private EC2 如何連到 Internet]]
>   - [[#Elastic IP|Elastic IP]]
>   - [[#ENI 是 EC2 的虛擬網卡|ENI 是 EC2 的虛擬網卡]]
>   - [[#為什麼設定 NAT Gateway 而不是 Forward Proxy|為什麼設定 NAT Gateway 而不是 Forward Proxy]]
> - [[#Security Group Authorization Topology|Security Group Authorization Topology]]
>   - [[#為什麼引用 Security Group 優於 CIDR？|為什麼引用 Security Group 優於 CIDR？]]
> - [[#Private EC2 如何進行維運|Private EC2 如何進行維運]]
>   - [[#SSH Model|SSH Model]]
>   - [[#AWS Systems Manager Session Manager（SSM）|AWS Systems Manager Session Manager（SSM）]]

![[aws-infra.svg]]

這篇從 Durable Queue 的流量路徑出發，整理 Region、AZ、VPC、Subnet、Route Table、Internet Gateway、NAT Gateway 與 Security Group 的責任。

# Networking terminology

- **VPC** ≈ 你自己公司機房裡的整個 LAN
- **Subnet** ≈ LAN 裡用 VLAN 或不同樓層劃分出的子網段
- **Route Table** ≈ Router 上的路由規則
- **Internet Gateway** ≈ 對外的邊界路由器(對應到公司的對外閘道)
- **Security Group / NACL** ≈ Firewall 規則(前者類似 stateful 防火牆,作用在instance層級;後者類似 stateless ACL,作用在 subnet 層級)

# Region、AZ、VPC 與 Subnet

```text
Region
└─ VPC：跨整個 Region 的邏輯網路
   ├─ Subnet A：位於 AZ A
   │  ├─ EC2
   │  └─ ENI
   └─ Subnet B：位於 AZ B
      ├─ EC2
      └─ ENI
```

VPC 是 Region-level logical network；Subnet 則必須位於單一 AZ。

Q: 為什麼subnet只能存在於單一AZ？

- **AZ 是彼此隔離的資料中心群組**  
    每個 AZ 有自己的電力、網路與實體設備，目的是避免單點故障。
- **EC2 實例只能實際運行在一個 AZ**  
    一台機器不可能同時有一半位於 AZ A、一半位於 AZ B。
- **EC2 的 ENI 會從 Subnet 取得 private IP**  
    所以 Subnet 必須明確屬於 EC2 所在的那個 AZ。
- 假如一個 Subnet 可以跨 AZ，就會出現語意問題：
	```
	EC2 10.0.1.10 到底位於 AZ A 還是 AZ B？
	它的網路介面應該接在哪個 AZ 的交換網路？
	AZ A 故障時，這個 IP 算不算仍然存在？
	```

## 資源的範圍

**先問自己:這個資源有沒有實體位置?**

|層級|特性|
|---|---|
|**Region 層級**|資源是邏輯性的,自動橫跨多個 AZ,不需要你手動指定 AZ|
|**AZ 層級**|資源實際跑在某一棟機房裡,一次只能存在一個 AZ|
|**橫跨型**|服務本身是邏輯性的,但底層會要求你在多個 AZ 各放一份資源|

### Region 層級(天生跨 AZ,不用你操心)

- **VPC**:整個 Region 範圍,VPC 本身沒有 AZ 概念
- **ALB (Application Load Balancer)**:AWS 全代管,自動分散到多個 AZ,你只需要告訴它「請在這些 subnet 部署節點」
- **Security Group**:附加在 ENI/instance 上,邏輯規則,沒有 AZ 屬性(跟著 instance 走,不是獨立資源)

### AZ 層級(綁定單一實體位置)

- **Subnet**:建立時就要指定一個 AZ,不能跨 AZ
- **EC2 Instance**:跑在特定 AZ 裡的特定實體機房
- 🟢**NAT Gateway**:雖然是 AWS 代管服務,但**每個 NAT Gateway 是建在某一個 subnet 裡,因此綁定單一 AZ**
    - 高可用設計 = 每個 AZ 各建一個 NAT Gateway

### 邏輯服務,但需要你手動配置跨 AZ

- **ASG (Auto Scaling Group)**:本身是邏輯概念,但你在設定時要指定多個 subnet(對應多個 AZ),它才會把 EC2 分散到不同 AZ
- **Target Group**:邏輯性的,裡面登記的 EC2 可以來自不同 AZ,ALB 會根據 Target Group 裡的清單分散流量
- **RDS Multi-AZ**:這是**特別要用「Multi-AZ」模式開啟**才會有 standby 副本在另一個 AZ;預設(Single-AZ)RDS 是綁定單一 AZ 的

# Route Table 與 Security Group 解決不同問題

```text
Route Table
└─ 這個封包應該往哪裡走？

Security Group
└─ 這個封包有沒有資格進入？
```

Route table 不是 firewall。存在路由不代表流量一定被允許；Security Group 允許流量，也不代表目的地一定有可達路徑。

# Public Subnet 與 Private Subnet 差在哪裡？

真正的主要差別是 route table 是否有直接通往 Internet Gateway 的 default route。

## Public Subnet

```text
Destination       Target
10.0.0.0/16       local
0.0.0.0/0         Internet Gateway
```

Public subnet 有直接通往 Internet Gateway 的路由，但這不代表其中所有 resources 都自動公開。Resource 還需要 public IP，Security Group 也必須允許流量。

## Private Subnet

```text
Destination       Target
10.0.0.0/16       local
0.0.0.0/0         NAT Gateway
```

Private subnet 沒有直接指向 Internet Gateway 的 default route。若 instance 需要主動連到 Internet，可以把 default route 指向 NAT Gateway。

## Local Route

建立 VPC 時，AWS 會自動在 route table 中加入一條 local route。

```text
10.0.0.0/16 → local
```

目的 IP 位於 VPC CIDR 內時，封包透過 AWS 的 VPC internal network 傳送。


# Ingress：使用者如何到達 API

## 第一段：Internet 到 ALB

```text
1. DNS 將 domain 解析到 ALB。
2. Client 發送 HTTPS request。
3. 流量經 Internet Gateway 進入 VPC。
4. ALB Security Group 檢查 TCP 443。
5. ALB 接收 request。
```

## 第二段：ALB 到 EC2

```text
6. ALB 檢查 listener rule。
7. 找到對應 Target Group。
8. 選擇 healthy EC2 target。
9. ALB 建立新連線到 EC2 private IP:port。
10. VPC local route 傳送封包。
11. EC2 Security Group 檢查來源是否為 ALB Security Group。
12. Application 接收 request。
```

Client 到 ALB 與 ALB 到 EC2 是兩條不同的連線。

# Egress：Private EC2 如何連到 Internet

Private EC2 只有 private IP，不能直接在 public Internet routing。NAT Gateway 會執行 source NAT：

```text
Private EC2
10.0.1.25:50000
  ↓ source address translation
NAT Gateway EIP:port
  ↓
Internet
```

Internet service 看到的是 NAT Gateway 的 Elastic IP，不是 EC2 的 private IP。

NAT 只保留 internal instance 主動建立的 connection mapping，因此 Internet 不能透過 NAT 任意建立 inbound connection 到 private EC2。

## Elastic IP

Elastic IP 是 AWS account 可以保留與重新綁定的 static public IPv4。它通常映射到 ENI 的 private IP：

```text
EC2
└─ ENI
   └─ Private IP: 10.0.1.10
       ↕ AWS network mapping
      Elastic IP: 18.x.x.x
```

## ENI 是 EC2 的虛擬網卡

ENI 包含：

- Private IP
- MAC address
- 所屬 Subnet 與 AZ
- Security Groups
- 可選的 public IP / Elastic IP mapping

```text
EC2
└─ ENI
   ├─ Private IP
   ├─ MAC address
   ├─ Security Groups
   └─ Subnet / AZ
```

更精確地說，Security Group 是附加在 ENI，而不是直接附加在 application process。

## 為什麼設定 NAT Gateway 而不是 Forward Proxy

[[Request Flow and Application Runtime (Gunicorn, Reverse Proxy, Django Allowed Host)#NAT 是 forward proxy 嗎？]]

NAT Gateway 是透明的 L3/L4 source NAT，應用程式不用修改，就能讓 private EC2 對外連線；它只改寫 IP 和 port，不會像 proxy 一樣終止並重建應用層連線。

Forward Proxy 雖然也能隱藏來源 IP，還能做網域控管與稽核，但需要應用程式或協定支援，通用性較差。因此 NAT 適合當 private subnet 的預設 Internet 出口，Proxy 則用於更細緻的 egress 管理。

# Security Group Authorization Topology

![[sec-topology-sg.svg]]

Worker 是 Redis 和 RDS 的 client，主動建立 outbound connection，因此不需要 application ingress。Security Group 是 stateful firewall，回應流量會自動被允許。

## 為什麼引用 Security Group 優於 CIDR？

```text
Source = SG-api
→ 允許綁定 SG-api 的 ENIs

Source = 10.0.11.0/24
→ 允許整個 subnet 中的 resources
```

兩種方式都不依賴固定 instance IP，但 SG reference 更精確，避免把同一 subnet 中不屬於 API 的 resources 一起放行，較符合 least privilege。

# Private EC2 如何進行維運

Q: 我的ec2在private subnet，要怎麼連線進去看docker ps / user_data log？

Q: 如果是開Security group port 22+public ip，用ssh連進去，這是我過去CS知識可以理解並推導出來的，但這個SSM一直無法在我腦中建立觀念，他是用什麼CS基礎知識做到的

## SSH Model

```text
Developer
  ↓ TCP 22
EC2 public IP
  ↓
sshd
  ↓
Shell
```

這需要 public routing、inbound port 22、SSH daemon 與 SSH key。

EC2 概念上：
```
# EC2 上的 sshd，概念上
server_socket.bind(("0.0.0.0", 22))
server_socket.listen()
connection = server_socket.accept()
```

需要具備：
- 外部可路由的 Public IP
- Security Group 允許 inbound TCP 22
- OS 裡有 `sshd` 監聽 port 22
- SSH key 等身分驗證機制

## AWS Systems Manager Session Manager（SSM）

概念換成 client 主動去維持連線：
```
Private EC2 (EC2 裡的 `amazon-ssm-agent` 主動做 connect AWS SSM endpoint:443)
  │
  │ 透過 NAT Gateway 主動建立 outbound HTTPS 連線
  ▼
AWS Systems Manager
  ▲
  │
你的瀏覽器 / AWS CLI
```

AWS 託管的公開 Systems Manager endpoint 不在你的 VPC 裡，也不是你管理的 EC2，因此你看不到、也不能設定它的 Security Group。

AWS 自己負責保護這個服務。

要使用 SSM 有三個條件：

1. EC2 的 IAM Role 要有 SSM 權限
2. EC2 裡要有 SSM Agent（Amazon Linux 2023 和許多 Ubuntu AWS AMI 通常已經預裝）
3. Private EC2 必須能主動連到 SSM（**不需要 inbound 22**，但要能 outbound HTTPS `443`）-> 透過 NAT gateway
4. 使用者端需要 AWS IAM 身分 （ssm:StartSession 等權限）

SSM 不需要 EC2 public IP 或 inbound port 22；核心模式是 agent 主動建立 outbound connection。
