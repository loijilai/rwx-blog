---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Runtime Stack|Runtime Stack]]
>   - [[#AMI 與 CPU Architecture|AMI 與 CPU Architecture]]
> - [[#建立 EC2 的三種抽象|建立 EC2 的三種抽象]]
>   - [[#1. 直接建立單台 EC2|1. 直接建立單台 EC2]]
>   - [[#2. Launch Template|2. Launch Template]]
>   - [[#3. ASG + Launch Template|3. ASG + Launch Template]]
> - [[#ASG 與 ALB Target Group|ASG 與 ALB Target Group]]
>   - [[#為什麼 API 和 Worker 使用不同 ASG？|為什麼 API 和 Worker 使用不同 ASG？]]
>   - [[#在ASG裡面寫target group的原理是什麼？|在ASG裡面寫target group的原理是什麼？]]
>   - [[#Durable Queue 專案中如何設定 Instance Refresh|Durable Queue 專案中如何設定 Instance Refresh]]
> - [[#EC2 Bootstrap Flow|EC2 Bootstrap Flow]]
>   - [[#從 ECR Pull Image|從 ECR Pull Image]]
>   - [[#Runtime Configuration|Runtime Configuration]]
>   - [[#Environment Variables 永遠是字串|Environment Variables 永遠是字串]]


這篇整理 Durable Queue 的 compute layer：AMI 與 CPU architecture、EC2、Launch Template、Auto Scaling Group，以及 application image 如何從 CI 進入 production instances。

# Runtime Stack

```text
EC2 實體 CPU
├─ x86_64：t3、t3a、m5、m6i...
└─ arm64：t4g、m6g、m7g...
        ↓
EC2 上的 Linux kernel (AMI)
        ↓
Docker container
        ↓
你的 Django / Python / native dependencies
```

Docker 封裝了 user space 與 dependencies，但沒有消除 host CPU architecture 的差異。

## AMI 與 CPU Architecture

Q: 我一開始的疑問是：要怎麼決定 AMI 與 CPU 架構？ 我以為用docker把django包起來就不用顧慮這個？

```
x86_64 EC2
→ 最自然執行 linux/amd64 image (github runner)

ARM EC2
→ 最自然執行 linux/arm64 image
```

關鍵點要看 docker build 是在哪裡執行的，Standard GitHub-hosted runners run on `x86_64` (`amd64`) hardware。

Q: Python 程式不是文字嗎？應該是 portable 在不同架構上？

A: 你的 Django code 確實主要是 Python 原始碼，但容器裡不只有 Django：

```
Docker image
├─ Linux user-space binaries
├─ Python interpreter
├─ pip packages
├─ glibc
├─ gunicorn
└─ native extension
   ├─ psycopg
   ├─ cryptography
   ├─ numpy
   └─ 其他 C / Rust library
```

其中 Python interpreter、system libraries、native wheels 都是針對特定 CPU 架構編譯的，因此 build architecture 必須和 production runtime 相容。

# 建立 EC2 的三種抽象

## 1. 直接建立單台 EC2

Terraform resource：`aws_instance`

```text
aws_instance
  ↓
一台具體 EC2
```

直接指定 AMI、instance type、subnet、Security Group、IAM Role 與 `user_data`。適合學習、快速驗證與不要求自動修復的環境。

心智模型：

> 我要建立並管理這一台機器。

## 2. Launch Template

Terraform resource：`aws_launch_template`

Launch Template 不是 EC2，而是建立 EC2 的規格書：

```text
Launch Template
├─ AMI
├─ Instance type
├─ Security Groups
├─ IAM Instance Profile
├─ EBS
├─ User data
└─ IMDS settings
```

Launch Template 本身不一定建立任何 EC2，可以被 ASG 或其他服務重複使用。

心智模型：

> 未來建立的機器都照這份規格。

## 3. ASG + Launch Template

```text
Launch Template
  ↓ 定義每台機器
Auto Scaling Group
  ↓ 管理數量與生命週期
EC2 instances
```

ASG 管理：

- `min_size`
- `desired_capacity`
- `max_size`
- 可以放置 EC2 的 subnets / AZs
- Health check
- Scaling policy
- Instance replacement

心智模型：

> 我不在乎是哪一台機器，只在乎隨時維持正確數量。

即使設定：

```text
min_size         = 1
desired_capacity = 1
max_size         = 1
```

ASG 仍能在 instance 故障後建立替代機器，但替換期間可能中斷，因此不等於 HA。

# ASG 與 ALB Target Group

```text
ASG 建立 EC2
  ↓
自動註冊到 Target Group
  ↓
ALB health check
  ↓
Healthy target 開始接收流量

EC2 不健康
  ↓
ASG 建立替代 instance
  ↓
舊 target 移除、新 target 加入
```

ASG 可以跨 AZ，但每一台 EC2 只會位於一個 subnet 和 AZ。ASG 會在被允許的 subnets 之間維持 instances。

## 為什麼 API 和 Worker 使用不同 ASG？

最主要原因是 independent scaling axes：

```text
API ASG
└─ 依 HTTP traffic、request concurrency 或 CPU 擴縮

Worker ASG
└─ 依 queue depth、task latency 或 CPU 擴縮
```

如果 API 和 worker 綁在同一個 ASG，只能一起增加或減少，無法針對真正的 bottleneck 擴展。拆開後也得到 failure isolation，並能使用不同的 health 與 deployment policy。

## 在ASG裡面寫target group的原理是什麼？

告訴 ASG：「我建立出來的 EC2，要自動註冊到這個 Target Group 裡，讓 ALB 可以找到它們。」

## Durable Queue 專案中如何設定 Instance Refresh

### ASG instance lifecycle
```
Pending
   ↓
InService
   ↓
Terminating
   ↓
Terminated
```

AWS 官方將 `InService` 定義為：

> Instance 已完成啟動流程、加入 Auto Scaling group 成為正式成員，並計入 ASG 的 desired capacity，且尚未被 ASG 根據 EC2 或 ALB health check 判定為需要退出服務並替換。

但要注意，ASG 的 `InService` 不等於 ALB target 的 `Healthy`，因為health check grace period 是從 instance 進入 `InService` 後開始計算，在這段期間 Auto Scaling 暫不根據相關健康失敗替換 instance。

### ASG 設定

```
health_check_type         = "ELB" # 用ALB判斷應用程式能不能接流量
health_check_grace_period = 300 # 前 300 秒 unhealthy asg 不會真的替換
```

### CD 的 instance refresh 設定
```
{
  "MinHealthyPercentage": 50, # 部署期間至少保留多少健康容量
  "InstanceWarmup": 60
}
```

### 整體流程

Instance Refresh 會追蹤「健康狀態」和「warm-up time」，兩者都符合後才把該 instance 視為完成更新。健康檢查和 InstanceWarmup 都是在進入 InService 之後開始計算。

“When the instance’s health status changes to healthy and the specified warm-up time passes, the instance is considered updated.” -- https://docs.aws.amazon.com/cli/latest/reference/autoscaling/describe-instance-refreshes.html?utm_source=chatgpt.com

替換下一批的最短時間
```
≈ max(
    InstanceWarmup,
    實際變成 Healthy 所需時間
  )
```

# EC2 Bootstrap Flow

EC2 開機後需要完成四件事：

```text
1. 安裝並啟動 Docker
2. 使用 Instance Profile 登入 ECR，pull image
3. 組合 runtime configuration
4. docker run API 或 worker
```

## 從 ECR Pull Image

EC2 IAM Role 需要兩組權限：

```text
ecr:GetAuthorizationToken
└─ 讓 AWS CLI 取得 ECR login token

Repository read permissions
├─ ecr:BatchCheckLayerAvailability
├─ ecr:GetDownloadUrlForLayer
└─ ecr:BatchGetImage
```

```shell
aws ecr get-login-password --region REGION \
  | docker login --username AWS --password-stdin REGISTRY

docker pull IMAGE
```

這裡有兩層 credentials：

```text
AWS CLI 從 IMDS 取得 IAM Role 短期 credentials
  ↓ credientials
ECR API 回傳 Docker login token


Docker 用 login token 登入
  ↓ pull image
ECR Registry
```

Docker 不理解 IAM Role，因此 AWS CLI 在中間把 AWS identity 換成 Docker registry 能使用的 token。

### 為什麼 EC2 不應該自己 Build Image？而是從 ECR pull?

核心原因是 immutable artifact：

```text
CI
  ↓ build once
已測試的 Docker image
  ↓ push
ECR
  ↓ pull
所有 production instances
```

如果每台 EC2 各自執行 `docker build`：

- Base image 可能在不同時間改變。
- Dependencies 可能解析到不同版本。
- 無法證明所有 instances 使用相同 artifact。
- Production 執行的內容不一定是 CI 測試過的內容。

因此 build 和 run 必須分離：CI build，EC2 只 pull and run。詳細 CI/CD 流程見 [[Continuous Integration and Delivery 基本觀念]] 與 [[Continuous Integration and Delivery 實作紀錄]]。

## Runtime Configuration

Bootstrap script 會組合：

- Terraform 注入的 non-secret endpoints 和 flags。
- 從 Secrets Manager 取得的 password、Django `SECRET_KEY` 與 OAuth credentials。

詳細分類見 [[IAM, Secrets, and Runtime Configuration]]。

## Environment Variables 永遠是字串

```shell
docker run -e DEBUG=False ...
```

Container 內取得的是字串 `"False"`，不是 boolean `False`。Application 必須明確解析 boolean configuration，不能直接依賴 Python 對非空字串的 truthiness。
