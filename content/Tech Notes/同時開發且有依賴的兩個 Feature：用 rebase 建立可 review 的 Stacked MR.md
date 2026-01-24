---
publish: true
tags:
date:
comments: true
---
在實務開發中，並不是所有被混在同一條 branch 的功能都是意外([[拆分混在同一個 Git Branch 的兩個 Feature：用 cherry-pick 把提交拆乾淨]])。有些時候，兩個 feature 之所以會黏在一起，是因為它們本來就存在先後與依賴關係。

常見的一種情境是：兩個 feature 同時在開發中，而且彼此存在明確依賴，但仍然希望**分開 review、分開討論、分開合併**。這種需求的關鍵做法只有一句話：

> **在送出 Feature B 之前，先把 Feature A rebase 進來。**

這篇文章要說明的是一種被稱為 **Stacked Merge Request（或 Stacked PR）** 的工作方式，以及它為什麼適合這種情境。

---

## 問題背景：兩個功能同時開發，但又不想綁在同一個 MR

假設你正在開發一個後端服務，並且有以下兩個需求同時進行：

- Feature A：新增 `/login` API，建立完整的驗證流程
- Feature B：新增 `/metrics` API，但只允許「通過驗證」的使用者存取
    
在這個設定下，`/metrics` **不是一個獨立存在的功能**。它在設計上就明確依賴登入機制與驗證流程，因此 Feature B 依賴 Feature A 並不是疏忽，而是需求本身的結果。

然而，你仍然希望達成幾個實務目標：
- `/login` 與 `/metrics` 可以各自被 review，reviewer 不需要在同一個 PR 裡同時理解兩個功能
- Feature A 和 Feature B 可以被要求修改，持續同時開發

如果你把兩個功能寫在同一條 branch、開一個 MR，這些目標幾乎不可能同時成立。

---

## 上篇介紹的做法，為什麼行不通

上篇介紹的做法：[[拆分混在同一個 Git Branch 的兩個 Feature：用 cherry-pick 把提交拆乾淨]]，目標是把兩個Feature拆分成獨立的兩個Branch各自送MR，也就是如下圖所示：

```text
main
├─ feat/login
└─ feat/metrics
```

問題在於，現在的情境之下， `/metrics` 無法獨立存在，沒有 `/login` 的驗證邏輯，`/metrics` 無法編譯。

在這種情境下，強行追求「每個 feature 都有獨立 branch」反而會製造更多問題。

---

## 正確的做法：讓 Feature B 建立在 Feature A 之上

比較合理的流程是：

1. 從 `main` 開發 Feature A（`feat/login`）
2. **從 Feature A 的 branch 再開 Feature B（`feat/metrics`）**
    
此時 branch 的關係會長得像這樣：

```text
main
 └─ feat/login
     └─ feat/metrics
```

這代表一個明確的事實：Feature B 是建立在 Feature A 之上的，而不是與它平行。

---

## 那什麼是 Stacked MR？

當你依序送出兩個 MR：

- MR A：`feat/login` → `main`
- MR B：`feat/metrics` → `feat/login` 注意是Feature A的Branch

> 後面的 MR，是以前一個尚未合併的 MR 為基底，這就是 **Stacked Merge Request**

因此 reviewer 在看 MR B 時，預設 Feature A 的存在是合理的，而 review 的焦點只會放在 `/metrics` 本身。

---

## 為什麼送出 Feature B 前一定要 rebase Feature A

在實際開發過程中，Feature A 很可能還在 review 中，甚至會被要求修改。

如果 Feature B 是從舊版的 Feature A 分支切出來的，而你沒有 rebase，那麼：

- Feature A 新的修改不會反映在 Feature B，reviewer 在看 Feature B 時，看到的是「過時的基礎」
- 未來合併時，衝突會集中爆發
    
因此，在送出或更新 Feature B 的 MR 之前，你應該先這樣做：

```bash
git checkout feat/metrics
git fetch
git rebase feat/login
```

這個動作的意義是：**重新宣告 Feature B 是建立在「最新版本的 Feature A」之上**。

---
## 結論

當你選擇讓 Feature B 建立在 Feature A 之上，並且在送出前持續 rebase，就達到了：**兩個 feature 同時開發、彼此依賴、又能夠分開 review增加可讀性**。