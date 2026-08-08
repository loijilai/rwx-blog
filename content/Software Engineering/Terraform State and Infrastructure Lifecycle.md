---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Configuration、State 與 Real Infrastructure|Configuration、State 與 Real Infrastructure]]
> - [[#Terraform State 為什麼敏感？|Terraform State 為什麼敏感？]]
>   - [[#Remote Backend 擴大了 Security Boundary|Remote Backend 擴大了 Security Boundary]]
>   - [[#Terraform 與 Secrets Manager 的責任|Terraform 與 Secrets Manager 的責任]]
> - [[#Terraform Template 與 Shell Interpolation|Terraform Template 與 Shell Interpolation]]
> - [[#State 遺失與 terraform import|State 遺失與 terraform import]]
> - [[#Bootstrap Infrastructure (雞生蛋蛋生雞問題)|Bootstrap Infrastructure (雞生蛋蛋生雞問題)]]
>   - [[#CI/CD 中的 Terraform Permission Boundary|CI/CD 中的 Terraform Permission Boundary]]


這篇整理 Terraform 在 Durable Queue 架構中的責任，以及 configuration、state 和 AWS real infrastructure 三者如何維持一致。

# Configuration、State 與 Real Infrastructure

```text
Terraform configuration
└─ 描述 desired state

Terraform state
└─ 記錄 Terraform 管理了哪些 real resources

AWS
└─ 實際存在的 infrastructure
```

```text
terraform plan
  ↓
比較 configuration、state 與 provider 讀到的 real infrastructure
  ↓
計算需要建立、修改或刪除的 actions
```

State 不是單純的 cache；它保存 Terraform resource address 與 real provider object 之間的 mapping。

# Terraform State 為什麼敏感？

即使 input variable 宣告：

```hcl
sensitive = true
```

也只代表 Terraform 會在 CLI output 中隱藏它，不代表：

- Value 被加密。
- Value 不會寫入 state。
- Remote backend 的讀取者看不到它。

若 secret value 被傳入 resource attributes，它仍可能以明文存在 `terraform.tfstate`。

因此 state 必須被當作 sensitive data 管理：

1. 不 commit 到 Git。
2. Remote backend 啟用 encryption。
3. 嚴格限制 backend IAM permissions。
4. 把能讀 state 的 CI runner 納入 threat model。

## Remote Backend 擴大了 Security Boundary

Local development 時，`.env` 和 local state 都只在開發者電腦；導入 remote backend 和 CI 後，更多 identities 可能接觸 state：

```text
GitHub Actions Runner
  ↓ terraform init / plan / apply
S3 Backend
  ↓
Terraform State
```

GitHub deployment role 必須能讀寫 state object，能使用該 role 的 workload 因此也是 state security boundary 的一部分。

1. **Store Terraform state in a backend that supports encryption**
2. **Strictly control who can access your Terraform backend**

For example, if you’re using S3 as a backend, you’ll want to configure an IAM policy that solely grants access to the S3 bucket for production to a small handful of trusted devs (or perhaps solely just the CI server you use to deploy to prod). -- https://www.gruntwork.io/blog/a-comprehensive-guide-to-managing-secrets-in-your-terraform-code

## Terraform 與 Secrets Manager 的責任

核心原則是：

> Terraform 建立空的保險箱與誰能打開它；secret value 從 Terraform 之外注入。

```text
Terraform
├─ 建立 Secrets Manager secret container
├─ 建立 IAM access policy
└─ 把 secret identifier 提供給 workload

Out-of-band process
└─ put-secret-value
```

這樣可以讓 actual secret value 不經過 `.tf` 和 Terraform state。

# Terraform Template 與 Shell Interpolation

`user_data` template 中可能同時出現兩種 `${...}`：

1. Terraform interpolation。
2. Shell variable expansion。

```hcl
user_data = <<-EOF
  # Terraform 解析
  echo "Region: ${var.aws_region}"

  # Terraform 輸出 literal ${USER}，交給 shell 解析
  echo "User: $${USER}"
EOF
```

`$${...}` 會 escape Terraform interpolation，讓輸出保留 `${...}` 給 shell runtime 使用。

這個區分很重要，因為同一份 `user_data` 同時經過：

```text
Terraform template rendering
  ↓
EC2 user_data
  ↓
Shell execution
```

# State 遺失與 `terraform import`

若 AWS resources 還存在，但 Terraform state 遺失：

```text
Terraform configuration：有
Terraform state：沒有
AWS resources：有
```

`terraform import` 的作用是把既有 AWS object 和 Terraform resource address 建立 mapping：

- 寫入 state。
- 不修改 AWS resource。
- 不自動修改 `.tf` configuration。

完成 import 後仍要執行 `terraform plan`。理想驗收結果是：

```text
No changes
```

這表示 configuration、state 和 AWS real infrastructure 三者一致。

# Bootstrap Infrastructure (雞生蛋蛋生雞問題)

Remote backend 的 S3 bucket 本身也需要被建立，形成 bootstrap 問題：Terraform 的 state bucket 在一開始還不存在。

常見流程是：

```text
Local bootstrap state
  ↓
建立 S3 backend
  ↓
terraform init -migrate-state
  ↓
後續使用 remote state
```

若 bootstrap state 最後放在它自己管理的 bucket 中，日常操作可以正常運作，但完整 destroy 時必須先處理 state migration，避免刪除 bucket 的同時失去 Terraform 自己的管理記錄。

## CI/CD 中的 Terraform Permission Boundary

首次建立 infrastructure 和日常 deployment 是不同工作：

```text
Bootstrap / Infrastructure Administration
└─ 建立 VPC、IAM、RDS、ASG、ECR、State Backend

Incremental Deployment
└─ Push image、更新 Launch Template、啟動 ASG refresh
```

日常 CD role 不必具有建立所有 infrastructure 的權限。限制它只能做 incremental deployment，可以縮小 credential 被濫用時的 blast radius。

詳細部署流程見 [[Continuous Integration and Delivery 基本觀念]] 與 [[Continuous Integration and Delivery 實作紀錄]]。
