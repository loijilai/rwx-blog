---
publish: true
tags:
  - Git
date:
comments: true
---
你一定遇過這種情境：原本在同一個 branch 上開發一個功能，寫到一半順手把另一個功能也做掉了。當下覺得省事，之後卻付出代價。當你準備開 Merge Request，reviewer 必須在同一個 PR 裡同時理解兩個不相干的需求、兩組 API 路由，以及各自不同的修改動機，review 討論容易失焦。

這篇文章的目標很單純：把「混在同一條 branch 的兩個 feature」拆成兩條乾淨的 feature branch，讓每個 PR 都只專注在一件事情上。

本文會用一個刻意簡化的例子來說明，重點放在 Git 的操作，而不是實作細節。

> ⭐️這篇的情境是：兩個feature真的是互相獨立的，只是不小心被commit在同一個branch
> 
> 如果feature B真的依賴feature A，就要看這篇文章 [[同時開發且有依賴的兩個 Feature：用 rebase 建立可 review 的 Stacked MR]]

## 問題：兩個完全獨立的 API 被寫在同一條 branch

假設你正在開發一個後端服務，過程中做了兩個功能：

Feature A：新增 `/login` API，負責帳號密碼驗證。  
Feature B：新增 `/metrics` API，用來回傳服務指標，例如請求次數、錯誤率與平均處理時間。

這兩個功能的用途不同，但你一開始是在同一條 branch 上開發，commit 也交錯在一起。現在其中一個功能已經準備送審，另一個則還在調整，你希望把它們拆開。

此時你查看 `git log --oneline`，看到類似下面的結果，越下面代表越早的 commit：

```bash
c91b3f2  refactor: metrics handler
b77a1e4  refactor: metrics response format
a82d9c1  feat: add /metrics api   ← 分界點
---------------------------------
6f3a9aa  refactor: login validation
4e92c10  feat: add /login api
```

從 commit 訊息就能看出來，下半段是 `/login` API，上半段是 `/metrics` API。問題不在內容對不對，而在於它們被混在同一條 branch 裡。

你真正想要的狀態是：

```text
main
 ├─ feat: login api
 └─ feat: metrics api
```

也就是說，`/login` 與 `/metrics` 各自有獨立的 branch 與 PR，而不是被迫一起被檢視。

## 正確的做法：從乾淨基底開 branch，再逐顆 cherry-pick

### 從乾淨的 main 開新 branch

第一步永遠是確保基底乾淨。你要讓新的功能 branch 從一個可預期的起點開始。

```bash
git checkout main
git pull
git checkout -b feat/metrics-api
```

這個 branch 的責任很單純：只放 `/metrics` API 相關的提交。之後如果出問題，你可以很確定問題只來自被搬過來的 commits。

### 一顆一顆 cherry-pick，而不是一次全搬

接下來要把 `/metrics` 相關的 commits 搬過來。你已經知道分界點是 `a82d9c1`，從這顆開始，往上都是你要的內容。

關鍵原則只有一個：不要一次 cherry-pick 完。每一顆 commit 都應該是一個可以被驗證的單位。

先搬 feature 的入口：

```bash
git cherry-pick a82d9c1
```

搬完之後立刻做最小驗證。以 .NET 專案來說，至少要能編譯、測試能跑，或啟動服務並呼叫 `/metrics` 看是否有回應。

```bash
dotnet build
dotnet test
```

這一步的目的不是保證功能完整，而是確認這顆 commit 本身是ok的。

接著再搬重構相關的提交：

```bash
git cherry-pick b77a1e4

git cherry-pick c91b3f2
```

每搬一顆，就驗證一次。這個節奏會讓任何隱含的依賴立刻浮出水面。

## 為什麼要這樣做：邊界錯了，會很快被抓到

當你逐顆 cherry-pick 時，如果發現某一顆 commit 沒辦法單獨成立，通常代表一件事：你以為 `/metrics` 是獨立的，但實際上它偷偷依賴了 `/login` 的某些結構，例如共用的 middleware、不該耦合的設定。

這種問題如果在最後一次性搬完才爆炸，你需要同時懷疑好幾顆 commit，定位成本會很高。相反地，逐顆驗證會讓你在最早的時間點知道「邊界其實不乾淨」。

一旦發現問題，應該立刻停下來處理：

| **指令**              | **行為**      | **結果**           | **典型用途**                                                                                      | 心中的話                    |
| ------------------- | ----------- | ---------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| cherry-pick --abort | 全部取消        | 回到 cherry-pick 前 | 發現依賴關係不對，兩個feature其實有dependency，應該要用:[[同時開發且有依賴的兩個 Feature：用 rebase 建立可 review 的 Stacked MR]] | 好像一開始就不該 cherry-pick 這顆 |
| cherry-pick --skip  | 跳過當前 commit | 繼續下一顆            | 這顆commit是垃圾(debug code、不重要的更新)                                                                | 這顆我本來就不想要               |

## 對 code review 真正有幫助的是「可理解的歷史」

當你用這種方式拆 branch，最後送出的 PR 只會專注在 `/metrics` API。reviewer 不需要同時理解登入流程，也不需要在心中過濾哪些修改與目前的功能無關。

更重要的是，這個過程本身就是一次設計檢查。你會在搬運 commit 的過程中，被迫回答一個問題：這個功能真的已經被好好隔離了嗎？如果答案是否定的，你會很快發現，而不是在 review 階段才被指出來。

## 收尾：乾淨的 branch

當 `feat/metrics-api` 上的每一顆 commit 都能獨立成立並通過驗證後，就可以放心推上 remote，開一個只談單一功能的 Merge Request。

```bash
git push -u origin feat/metrics-api
```