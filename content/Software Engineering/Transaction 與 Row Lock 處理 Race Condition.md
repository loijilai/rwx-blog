---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#測試可見性問題: 每個 thread 之間的 transaction 隔離|測試可見性問題: 每個 thread 之間的 transaction 隔離]]
> - [[#處理並發: 用 transaction 與 row lock|處理並發: 用 transaction 與 row lock]]

## 測試可見性問題: 每個 thread 之間的 transaction 隔離

在測並發時，我遇到一個重要觀念：

`django.test.TestCase` 會把每個 test 包在一個外層 transaction 裡，最後 rollback。這對一般測試很快，但副作用是：主 thread 在 test 裡建立的資料，還沒 commit，所以其他 thread 用自己的 DB connection / transaction 去查時，看不到那筆資料。

> 因為：不同 thread 會使用不同的 DB connection；不同 DB connection 代表不同 transaction；因此某個 transaction 尚未 commit 的資料，其他 transaction 看不到。

Django 的 database connection 是 thread-local 的。原因是 DB connection 本身通常不是 thread-safe 的，所以 Django 會讓不同 thread 使用各自的 connection。

這個觀念會直接影響測試：如果測試中開了多個 thread，而主 thread 建立資料後尚未 commit，worker thread 是看不到那些資料的。

> 這個專案後來的解法是：**並發測試改用 `TransactionTestCase`，不要用一般的 `TestCase`**。

## 處理並發: 用 transaction 與 row lock 

![[4-sequence-concurrency.png]]

`skip_locked=True` 的意思是：當這個查詢遇到已經被其他 transaction 鎖住的 row 時，直接跳過它，繼續找下一筆可用資料。它不是「讓別人可以跳過我加的鎖」，而是「我這個查詢遇到別人的鎖時要跳過」。

`transaction.atomic()` 在這裡有三個作用：

1. 讓 row lock 有明確的生命週期：lock 會在 transaction 結束時釋放。
2. 確保狀態轉換是 atomic 的：要嘛整段成功，要嘛整段 rollback。
3. 提供 transaction isolation：其他 transaction 看不到尚未 commit 的變更。

但要注意，`transaction.atomic()` 本身不是 mutual exclusion lock。真正讓 worker 不互搶同一筆資料的是 database row lock；`atomic()` 是提供 transaction 邊界，讓 row lock 和狀態更新可以放在同一個一致性範圍內。
