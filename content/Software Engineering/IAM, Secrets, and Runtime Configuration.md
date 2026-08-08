---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#IAM User 與 IAM Role|IAM User 與 IAM Role]]
> - [[#IAM Role 的三個部分|IAM Role 的三個部分]]
> - [[#EC2 如何取得短期 Credentials|EC2 如何取得短期 Credentials]]
> - [[#EC2 如何讀取 Secrets Manager|EC2 如何讀取 Secrets Manager]]
> - [[#Secret 與 Non-secret Configuration|Secret 與 Non-secret Configuration]]
> - [[#為什麼 Secret 不應放進 user_data？|為什麼 Secret 不應放進 user_data？]]
> - [[#Runtime Configuration Assembly|Runtime Configuration Assembly]]
> - [[#Django SECRET_KEY|Django SECRET_KEY]]


這篇整理 Durable Queue 在 AWS 上如何回答三個問題：一個 workload 是誰、它可以做什麼，以及 application 啟動所需的 secret 與 configuration 從哪裡來。

# IAM User 與 IAM Role

Access Key 和 OIDC 是取得 AWS identity 的方法；IAM User 和 IAM Role 才是 AWS identity 的種類。

|      | IAM User           | IAM Role                        |
| ---- | ------------------ | ------------------------------- |
| 代表誰  | 固定的人或程式帳號          | 暫時被扮演的身分                        |
| 憑證   | 可有密碼、Access Key    | 本身沒有長期 Access Key               |
| 使用方式 | 直接登入或使用 Access Key | 透過 STS `AssumeRole` 取得短期憑證      |
| 有效時間 | 長期存在               | 每次取得的 session 有期限               |
| 常見用途 | 人員帳號、舊式 CI/CD      | EC2、Lambda、GitHub Actions、跨帳號存取 |
| 安全性  | 長期憑證外洩風險較高         | 短期憑證，通常較安全                      |

Durable Queue 的 EC2 使用 IAM Role，不把長期 AWS access key 放進 instance environment 或設定檔。

# IAM Role 的三個部分

```text
IAM Role
├─ Trust Policy：誰可以扮演這個 Role
├─ Permission Policy：扮演後可以做什麼
└─ Instance Profile：把 Role 掛到 EC2 的包裝
```

```text
EC2
  ↓ 掛載
Instance Profile
  ↓ 包含
IAM Role
  ↓ 套用
Permission Policy
```

Console 建立 EC2 role 時，通常會同時建立並處理 Instance Profile；用 Terraform 時則需要理解兩者是不同 resources。

https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html?utm_source=chatgpt.com

# EC2 如何取得短期 Credentials

```text
EC2 上的 AWS SDK / CLI
  ↓
IMDSv2
  ↓
取得 Instance Profile Role 的短期 credentials
  ↓
呼叫 AWS API
```

Role 掛到 EC2 後，AWS 將 instance identity 與 role 綁定。Application 不需要保存長期 credentials，SDK 或 CLI 可以從 Instance Metadata Service 取得定期輪替的 temporary credentials。

# EC2 如何讀取 Secrets Manager

```text
EC2
  ↓ IMDSv2
Role temporary credentials
  ↓
Secrets Manager API
  ↓
POSTGRES_PASSWORD / SECRET_KEY / OAuth credentials
```

EC2 要讀 secret，Permission Policy 必須允許對指定 Secrets Manager resources 執行必要 actions。

這裡的 authentication 與 authorization 分別是：

- Instance Profile / IMDS 證明這台 EC2 使用哪個 role。
- Permission Policy 決定該 role 能讀哪些 secrets。

# Secret 與 Non-secret Configuration

Application 啟動需要兩類資料：

| 值                               | 是 secret？ | 正確歸屬                  |
| ------------------------------- | --------- | --------------------- |
| `POSTGRES_HOST`                 | ❌         | **Terraform 模板注入**    |
| `CELERY_BROKER_URL`             | ❌         | **Terraform 模板注入**    |
| `POSTGRES_DB` / `POSTGRES_USER` | ❌         | Terraform 注入          |
| `DEBUG`                         | ❌         | Terraform 注入          |
| `POSTGRES_PASSWORD`             | ✅         | **Secrets Manager 撈** |
| `SECRET_KEY`                    | ✅         | **Secrets Manager 撈** |
| `GOOGLE client_secret`          | ✅         | **Secrets Manager 撈** |

> Secret 由 Secrets Manager 提供；non-secret runtime configuration 由 Terraform 注入。

# 為什麼 Secret 不應放進 `user_data`？

若直接把 password 寫在 Terraform template 或 `user_data`：

- Secret 會出現在 source template。
- 能讀取 instance metadata 或 Launch Template 的 identity 可能看見它。

因此 `user_data` 應只包含「如何取得 secret」的流程，不包含 secret value 本身。

```text
User data
├─ AWS region
├─ Secret ARN / name
├─ ECR registry and image
└─ Runtime command

Secrets Manager
└─ Actual secret values
```

# Runtime Configuration Assembly

![[environment-variable-strategy-comparison.jpeg]]

我學了兩種：

1. Docker compose
2. Terraform

要把服務跑起來有兩個 dependency：

1. docker image ready
2. environment variable ready

第一點：在 docker compose 中，用的是本地 build 的 image，所以第一點很 trivial；而 Terraform （正式環境）的話就要靠 CI build 或是手動先 build 存到 ECR。

第二點：在 docker compose 中，環境變數預設值是放本機的 .env，其餘用 environment: 覆蓋；而 terraform 則是 config 用 terraform 注入，再由 ecs 拉 secret manager 湊齊所有需要的環境變數。

# Django `SECRET_KEY`

```
                 Django
                   |
          +--------+--------+
          |                 |
     SECRET_KEY        SIMPLE_JWT
          |                 |
          |                 |
  Django內部加密簽章     JWT token簽章
  CSRF                   access token
  password reset         refresh token
  session                JWT verify
```

SIMPLE_JWT 如果沒有設定 secret key，就會用 SECRET_KEY。
