---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Problem|Problem]]
> - [[#先區分 CI, Continuous Delivery 與 Continuous Deployment|先區分 CI, Continuous Delivery 與 Continuous Deployment]]
>   - [[#CI 是進入 main 前的守門員|CI 是進入 main 前的守門員]]
>   - [[#CD 管理的是交付風險|CD 管理的是交付風險]]
> - [[#Key Elements: Workflow, Job, Step, Runner|Key Elements: Workflow, Job, Step, Runner]]
>   - [[#Workflow 基本語法：on、jobs、steps、uses/run|Workflow 基本語法：on、jobs、steps、uses/run]]
>   - [[#進階語法: with（傳參數）、env（環境變數）、secrets（機密）、if（條件執行）|進階語法: with（傳參數）、env（環境變數）、secrets（機密）、if（條件執行）]]

# Problem

```
git push
↓
ssh server
↓
git pull
↓
docker compose build
↓
docker compose up
↓
跑 migration
↓
通知同事
```

改成

```
git push
↓
Github Actions
↓
全部完成
```

# 先區分 CI, Continuous Delivery 與 Continuous Deployment

CI/CD 中的 CD 有兩種常見含義。

| 階段 | 解決的問題 | 結果 |
|---|---|---|
| Continuous Integration | 這次修改是否破壞系統？ | 通過驗證的 commit |
| Continuous Delivery | 通過驗證的版本是否隨時可以部署？ | 等待批准的可部署版本 |
| Continuous Deployment | 通過驗證的版本能否自動進入 production？ | 自動上線的版本 |

## CI 是進入 main 前的守門員

CI 的任務不是證明系統永遠沒有 bug，而是對每次改動執行一致的最低品質檢查：

- 安裝 dependencies；
- lint 與 format check；
- unit test；
- integration test；
- security scan；
- 確認 application 或 Docker image 可以 build。

最重要的是執行時機。若程式先 merge 進 main，失敗後才發現 test 沒過，main 已經處於不可部署狀態。

```text
Feature branch
  ↓
開啟或更新 PR
  ↓
CI 執行
  ├─ failed → 禁止 merge
  └─ passed → 可以 merge
```

要讓 CI 真正成為 gate，除了撰寫 workflow，也要在 repository ruleset 或 branch protection 中，把 CI check 設為 merge 前的必要條件。

## CD 管理的是交付風險

通過 CI 只代表程式符合目前的自動化檢查，不代表應該毫無條件進入 production。CD 還需要回答：

- 哪一個 commit 正在部署？
- 誰可以觸發 production deployment？
- 是否需要人工批准？
- 同時間能否有兩次部署？
- migration 在何時執行？
- 如何確認新版本健康？
- 出問題時如何 rollback？

因此 deployment 不是 CI 後面多加一個 `ssh` step，而是一個新的安全邊界。

```
CI/CD
│
├── CI：Continuous Integration，持續整合
│   │
│   ├── 目的
│   │   ├── 提早發現錯誤
│   │   ├── 確保多人程式碼可以整合
│   │   └── 保證每次修改都通過基本品質檢查
│   │
│   └── 常見工作
│       ├── 安裝 dependencies
│       ├── lint / format check
│       ├── unit test
│       ├── integration test
│       ├── security scan
│       └── build Docker image
│
├── CD
│   │
│   ├── Continuous Delivery，持續交付
│   │   └── 成品隨時可部署，但正式部署要人工批准
│   │
│   └── Continuous Deployment，持續部署
│       └── 測試通過後，自動部署到正式環境
│
├── Artifact：部署成品
│   ├── Docker image
│   ├── Python package
│   ├── frontend static files
│   └── compiled binary
│
├── Environment：環境
│   ├── Development
│   ├── Test
│   ├── Staging
│   └── Production
│
└── 部署後
    ├── health check
    ├── logs
    ├── metrics
    ├── alerts
    └── rollback
```

# Key Elements: Workflow, Job, Step, Runner

```
Developer
    │
    │ git push
    ▼
GitHub Event
    │
    ▼
Workflow（完整流程）
    │
    ├── Job（一組工作）
    │       │
    │       ├── Step
    │       ├── Step
    │       └── Step
    │
    └── Job
            │
            ▼
Runner（臨時 VM）
            │
            ▼
執行 Shell / Docker / Terraform / AWS CLI ...
            │
            ▼
完成後 Runner 銷毀
```

## Workflow 基本語法：on、jobs、steps、uses/run

> 「什麼時候(on) → 做哪些工作(jobs) → 每個工作有哪些步驟(steps) → 每一步要執行什麼(run/uses)」

```
Workflow
│
├── on: 什麼事件觸發？
│
├── jobs: 要做哪些工作？每個 job 有自己的 Runner，所以可以平行執行
	  |
      └── steps: 每個工作有哪些步驟？
			└── uses: 使用現成的 GitHub Action
			└── run: 執行自己的 Shell 指令
```

每個 jobs 裡面的 steps 都是一個新的 shell，創立的檔案會延續（因為是同個 runner），但是 cd 之後 pwd 的結果不會延續。

## 進階語法: `with`（傳參數）、`env`（環境變數）、`secrets`（機密）、`if`（條件執行）

> **「Step 要怎麼知道該怎麼執行？」**

不是每個 Step 都只需要一行 `run` 或 `uses`，有時候需要告訴它版本、帳號、條件等等。

```
Step
│
├── uses  ← 用別人的 Action
│      │
│      └── with     ← 傳參數給 Action
│
├── run   ← 執行 Shell
│      │
│      └── env      ← 提供環境變數
│
├── secrets ← 機密資料（Token、Password）
│
└── if ← 要不要執行
```
