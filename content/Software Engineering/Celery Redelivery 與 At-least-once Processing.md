---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Redelivery 什麼時候發生？|Redelivery 什麼時候發生？]]
> - [[#Worker Crash 後可能看到的 Job State|Worker Crash 後可能看到的 Job State]]
> - [[#State Guard 解決了什麼？|State Guard 解決了什麼？]]
> - [[#State Idempotency 與 Execution Idempotency|State Idempotency 與 Execution Idempotency]]
> - [[#尚未解決的外部呼叫窗口|尚未解決的外部呼叫窗口]]
> - [[#目前接受的 Trade-off|目前接受的 Trade-off]]

# Redelivery 什麼時候發生？

在 at-least-once delivery 的系統中，如果 worker 已經取得 task，卻沒有成功 ACK，broker 可能再次投遞同一個 task。

Worker crash 的時間點不同，redelivery 發生時，database 可能會看到不同的 job state。

# Worker Crash 後可能看到的 Job State

| Redelivery 時看到的狀態 | 原 Worker 可能發生 Crash 的時間 |
|---|---|
| `PENDING` | Worker 取得 task 後，還沒寫入 `RUNNING` 就 crash |
| `RUNNING` | 已標記為 `RUNNING`，但工作執行到一半 crash |
| `SUCCEEDED` | 工作與 DB commit 已成功，但 ACK broker 前 crash |
| `FAILED` | 失敗狀態已 commit，但 ACK broker 前 crash |

# State Guard 解決了什麼？

目前專案在 state transition 層加入 guard。如果 job 已經進入 `SUCCEEDED` 或 `FAILED`，再次執行以下操作時會提早返回：

```text
mark_running()
mark_succeeded()
mark_failed()
```

這能避免 redelivery 覆蓋 terminal state。

例如，工作已成功完成，但 worker 在 ACK 前 crash：

```text
Worker 完成工作
  ↓
DB state = SUCCEEDED
  ↓
Worker 在 ACK 前 crash
  ↓
Broker redeliver
  ↓
State guard 發現 SUCCEEDED
  ↓
不再把狀態改回 RUNNING
```

# State Idempotency 與 Execution Idempotency

State guard 解決的是 state transition 重複執行的問題，但不代表整個 task execution 已經 idempotent。

```text
State idempotency
└─ 重複更新 job state 不會破壞 terminal state

Execution idempotency
└─ 重複執行外部操作也不會產生額外副作用
```

目前專案做到的是 state 層的保護；execution 層仍有刻意接受的殘餘窗口。

# 尚未解決的外部呼叫窗口

如果 worker 已經呼叫外部轉錄 API，但還沒把結果寫回 database 就 crash：

Database state 無法證明前一次外部操作已經成功，因此 redelivery 可能造成外部 API 被重複呼叫。

# 目前接受的 Trade-off

這是 at-least-once processing 常見的代價。目前專案接受這個 execution window，同時用 state guard 避免 terminal state 被覆蓋。

等到接入真實的付費 API，再評估：

- Idempotency key
- 結果去重
- 成本控制
- 更細的 job state

目前能明確保證的是：

> Job state 的重複更新不會破壞終態，但外部副作用仍可能被重複執行。
