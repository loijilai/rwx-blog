---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#建構 CI Pipeline|建構 CI Pipeline]]
>   - [[#Pipeline 應該在哪些事件執行？|Pipeline 應該在哪些事件執行？]]
>   - [[#Test Job 設計|Test Job 設計]]
> - [[#建構 CD Pipeline|建構 CD Pipeline]]
>   - [[#GitHub Actions 如何安全取得操作 AWS 的權限？OIDC Federation|GitHub Actions 如何安全取得操作 AWS 的權限？OIDC Federation]]
>   - [[#為什麼 Deployment 需要 environment 與 concurrency？|為什麼 Deployment 需要 environment 與 concurrency？]]

# 建構 CI Pipeline

## Pipeline 應該在哪些事件執行？

第一個要設計的是 Pipeline 應該在哪些事件執行？有哪些 stage、為什麼是這個順序、每個 stage 的觸發條件（哪個 branch / 什麼事件）。

| Job              | Event                                            | 責任        |
| ---------------- | ------------------------------------------------ | --------- |
| CI (test, build) | `pull_request` targeting `main`,`push` to `main` | merge 前驗證 |
| CD               | 僅有`push` to `main`                               | 部署        |

```text
開啟或更新 PR
  ↓ pull_request
執行 CI
  ↓ passed
Merge PR
  ↓ main ref 更新，產生 push event
執行 CD
```

`pull_request` + `push: main` **兩個都留**，是業界標準組合：
- `pull_request` → 守門，擋 merge。
- `push: main` → 事後查核合併結果 + 當作 CD 的觸發起點。

```yaml
on:
  pull_request:
    branches: [main]

  push:
    branches: [main]
```

## Test Job 設計

### Q: 為什麼 merge 後還要在 main 上再跑一次 test？

A: merge 後是新的 commit，那組狀態還沒有測試過。

### Q: 這樣一來,當你的 PR **被 merge** 的那一刻，會發生什麼？是不是同一份最終 code 會**觸發兩次** workflow（PR 那次 + push main 那次）？

A: 對，但是 pull_request 測的是 Github 暫時建立的 merge conflict

### Q: 這邊的 push main 是什麼意思？我又沒有 git push？

A: push 的意思是 某個 Git ref 被更新了。

```
手動 git push
    └── 會更新遠端 branch ref

PR merge
    └── GitHub 伺服器直接更新遠端 branch ref

兩者結果相同：
遠端 main 指向新的 commit
    ↓
觸發 push event
```

### Q: 如何用 Service Container 測試 PostgreSQL 與 Redis

Service Container 是 CI 裡的臨時基礎設施，只在該 CI job 期間存在，每次都是全新，適合 PostgreSQL、Redis 等依賴服務。

Q: compose 裡你是用 service name（postgres）當 DNS 連到 DB；但 CI 的 test step 是直接跑在 runner 主機上、不是在容器網路裡。那它要怎麼連到 service container？

這邊說一下 Django Test 的執行方式，有兩種：

#### 第一種方式是：Test Step 直接跑在 runner 主機上

例如：

```yaml
jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: password
          POSTGRES_DB: app_test
        ports:
          - 5432:5432 # <-- 注意這裡

    steps:
      - uses: actions/checkout@v4

      - name: Run tests
        env:
          DB_HOST: localhost # <-- 注意這裡
          DB_PORT: 5432
        run: python manage.py test # <-- test 直接在 runner 上執行
```

它的結構比較像：

```
runner VM
├─ python manage.py test
├─ Service Container
│  └─ postgres container
└─ localhost:6379 → redis container:6379
```

測試程式不在 Docker network 裡，因此不能直接靠 `postgres:5432` 連線。這其實很好理解，跟 docker-compose 的觀念一樣，只是現在 host 從我的 mac 變成 runner。

#### 第二種方式是：整個 Test Job 跑在 container

```yaml
jobs:
  test:
    runs-on: ubuntu-latest

    container: # <--- 整個 Test Job 跑在 Container 內部
      image: python:3.12

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: password
          POSTGRES_DB: app_test

    steps:
      - uses: actions/checkout@v4

      - name: Run tests
        env:
          DB_HOST: postgres # <--- 注意這裡
          DB_PORT: 5432
        run: python manage.py test
```

這時 `steps` 會在 `python:3.12` job container 裡執行，而 job container 和 service containers 會被放在同一個 Docker network：

```
runner VM
└─ Docker network
   ├─ job container
   │  └─ python manage.py test
   └─ postgres container
```

| 模式              | job steps 跑在哪 | service 怎麼連                                           |
| --------------- | ------------- | ----------------------------------------------------- |
| 沒有 `container:` | runner VM     | `localhost:<mapped-port>`                             |
| 有 `container:`  | job container | service label 當 hostname，例如 `postgres:5432`，而且不用開port |

> 比較容易混淆的是 service container 兩種寫法一樣，但是當整個test job被放在一個container內部，service container和test job就突然位於同一個network內。

### Q: 為什麼 Runner 會找不到 Django Test? Django 測試搜尋路徑問題

#### 專案結構

```text
repo/
├── AGENTS.md
└── durable_queue/              # 專案資料夾，不是 Python package
    ├── manage.py
    ├── durable_queue/          # Python package
    │   ├── __init__.py
    │   └── settings.py
    └── jobs/                   # Django app / Python package
        ├── __init__.py
        └── tests/
            ├── __init__.py
            └── test_api.py
```

#### 問題

從 repo root 執行：

```bash
python durable_queue/manage.py test
```

可能找不到測試；但進入 Django 專案目錄後執行：

```bash
cd durable_queue
python manage.py test
```

則可以正常找到。

#### 原因

Django 的 test runner 會近似從目前工作目錄 `.` 開始做 test discovery。

從 repo root 執行：

```
# cwd = repo/
python durable_queue/manage.py test
```

此時：

```
測試搜尋起點 = repo/
```

但外層的 `durable_queue/`：

```
repo/durable_queue/
```

只是專案資料夾，沒有 `__init__.py`，不是 Python package。Python 的 `unittest` discovery 在遞迴搜尋時，通常只會繼續進入可 import 的 package，因此可能不會再深入找到：

```
durable_queue/jobs/tests/test_api.py
```

#### 解法

固定從包含 `manage.py` 的目錄執行：

```bash
cd durable_queue
python manage.py test
```

也可以從 repo root 明確指定測試模組：

```bash
python durable_queue/manage.py test jobs
```

# 建構 CD Pipeline

- **搬進 CD（push master 後自動）**：
    1. build image，tag = git SHA
    2. push 到 ECR
    3. `terraform apply -var="image_tag=<sha>"` → 更新兩個 Launch Template
    4. 兩個 ASG `start-instance-refresh`

* GitHub Actions 怎麼拿到 AWS 權限。標準答案是 **OIDC**（GitHub 跟 AWS 建信任，臨時 token，不存長期 access key）

## GitHub Actions 如何安全取得操作 AWS 的權限？OIDC Federation

[[Api Authentication & Authorization 基本觀念#為什麼 GitHub→AWS 選 assertion]]
[[IAM, Secrets, and Runtime Configuration#IAM User 與 IAM Role]]

最直接但風險較高的做法，是把長期有效的 AWS access key 存進 GitHub Secrets。更合適的方式是使用 GitHub OIDC 和 AWS STS，讓每次 workflow 取得短期 credentials。

```text
GitHub Actions job
  ↓ 申請 OIDC token
GitHub OIDC Provider
  ↓ 簽發帶有 repo、ref、audience 等 claims 的 JWT
AWS STS AssumeRoleWithWebIdentity API
  ↓ 驗證 issuer、audience 與 subject
短期 AWS credentials
```

這條信任鏈的重點：

1. GitHub 證明這個 job 的身分；
2. AWS trust policy 決定哪些 GitHub 身分可以扮演 role；
3. AWS permission policy 決定 role 可以操作哪些 AWS resources。

### `permissions` 管 GitHub，不是 AWS IAM

```yaml
permissions:
  contents: read
  id-token: write
```

- `contents: read` 允許 workflow 讀取 repository，例如 checkout；
- `id-token: write` 允許 job 向 GitHub OIDC provider 申請 JWT。

### AWS 端需要三層設定

```text
OIDC Provider
└─ 我是否信任 GitHub 這個 token issuer？

Role trust policy
└─ 我信任 GitHub 裡的哪一個 repo、branch 或 environment？

Role permission policy
└─ 這個身分進來後，可以對哪些 AWS resources 做什麼？
```


第一層是 IAM OIDC identity provider，表示 AWS account 信任 GitHub 的 issuer：

```text
https://token.actions.githubusercontent.com
```

Audience 通常設為：

```text
sts.amazonaws.com
```

Terraform 範例：

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"] # 見下方說明
}
```

第二層是 IAM role trust policy，限制什麼 GitHub 身分可以執行 `AssumeRoleWithWebIdentity`：

```hcl
resource "aws_iam_role" "github_actions" {
  name = "durable-queue-github-actions"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # ★ 鎖到你的 repo + master branch，別放寬成 repo:*/*
          "token.actions.githubusercontent.com:sub" = "repo:loijilai/durable-queue:ref:refs/heads/master"
        }
      }
    }]
  })
}
```

不要為了省事寫成過度寬鬆的 `repo:loijilai/durable-queue:*`。CI 可以對所有 PR 開放，但有 production 權限的 CD 應只允許受保護的 branch、tag 或 GitHub Environment。

第三層是 Role permission Policy，這個身份進來後，可以對哪些 AWS resources 做什麼？

```
resource "aws_iam_role_policy" "github_actions" {
  name = "durable-queue-cd"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
		...
    ]
  })
}
```

### 信任鏈如何建立？

google能夠發出id_token是因為有authorization code, redirect url, client_id, client_secret 那github是怎麼發出oidc證明github runner的可信？

信任鏈是：

```
GitHub 控制 workflow job
→ GitHub 知道 job 的真實 repo / branch
→ GitHub 為該 job 簽發短期 JWT
→ AWS 信任 GitHub 的簽章
→ AWS 依 JWT claims 決定是否允許 AssumeRole
```

github 簽出來的 jwt
```json
{
  "iss": "https://token.actions.githubusercontent.com",
  "sub": "repo:你的帳號/你的repo:ref:refs/heads/main",
  "aud": "sts.amazonaws.com",
  "repository": "你的帳號/你的repo",
  "ref": "refs/heads/main"
}
```


## 為什麼 Deployment 需要 `environment` 與 `concurrency`？

```yaml
environment: production

concurrency:
  group: production-deployment
  cancel-in-progress: false # 不要 cancel 已經在進行的 deploy job
```

它們解決不同問題：

- `environment` 表示部署目標，可搭配 branch restrictions、required reviewers 與 environment secrets；
- `concurrency` 防止多個 production deployment 同時修改相同 infrastructure。

Production deployment 通常不應使用 `cancel-in-progress: true` 隨意中斷已經開始的 Terraform apply 或 rollout。比較安全的選擇是序列化部署，讓下一個版本等待目前部署完成。

若選擇 Continuous Delivery，可以讓 workflow 自動走到 production environment 前，再由 required reviewer 批准；不需要把整條 pipeline 都改成人工執行。
