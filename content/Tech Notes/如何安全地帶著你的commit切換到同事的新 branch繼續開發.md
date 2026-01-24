---
publish: true
tags:
  - Git
date:
comments: true
---
在開發中你可能會遇到這種情境：你原本在一條功能開發 branch（例如 `feature/a`）上工作了一段時間，手上已經有一些修改；這時同事基於同一個起點，在遠端建立了另一條新的功能 branch（例如 `feature/b`），而你接下來的需求是改成「接在那條新的 branch 後面」繼續開發。

這通常發生在兩個人都負責同一個feature上，所以不是兩個獨立的branch。

為了避免讓讀者把注意力浪費在 branch 命名上，本文的branch名稱簡化如下：

- `feature/a`：你原本本地正在開發的 branch
- `feature/b`：同事已經推到遠端、你之後要接手繼續開發的目標 branch
    
---

## 問題的本質是什麼？

你真正想做的事情，其實只有一件：

> 把目前在 `feature/a` 上做的修改，轉移到「同事新開的 branch」上，並且從此以後就在那個 branch 繼續開發。

關鍵差異只有一個：

**你現在在 `feature/a` 上的修改，是否已經 commit？**

---

## 情境一：你在 `feature/a` 上的修改「已經 commit」

這是最乾淨、也最容易處理的情況。你的修改已經是明確的 commits，只是目前掛在 `feature/a` 這條 branch 上，而你希望它們改成掛在同事的新 branch 底下。

### 真正的目標

- 同事的 `feature/b` 保留原本的 commits
- 再接上你在 `feature/a` 上已經完成的 commits
- 從此之後，你就在 `feature/b` 繼續往下開發

### 正確的操作流程

第一步，先把遠端狀態抓回來，確保你看到的是最新的 branch 結構。

```bash
git fetch origin
```

接著，切到「你之後要繼續開發的 branch」。這一步很重要，因為 `rebase` 永遠只會影響你**現在站的那條 branch**。

```bash
git checkout -b feature/b origin/feature/b
```

此時你的 HEAD 已經在 `feature/b`，代表接下來的操作都會改寫這條 branch 的歷史。

接下來，把你在 `feature/a` 上的 commits 接過來。

```bash
// 確認你在feature/b上
git rebase feature/a
```

這個指令的語意是：

> 把「目前這條 branch（`feature/b`）」與 `feature/a` 之間的差異 commits，重新接在 `feature/a` 的後面。

如果有衝突，照正常流程解完、`git rebase --continue` 即可。

最後，因為你改寫了 `feature/b` 的 commit 歷史，推回遠端時一定要使用 force，而且要用相對安全的版本。

```bash
git push --force-with-lease origin feature/b
```

### 最終結果會是什麼樣子？

- `feature/b`：包含同事原本的 commits，加上你從 `feature/a` 帶過來的 commits
- `feature/a`：可以保留，也可以之後再清理，它是過渡用的 branch

---

## 情境二：你在 `feature/a` 上還有修改，但「尚未 commit」

這是另一個非常常見的狀況。你可能已經改了一些檔案，甚至有 `staged` 的內容，但還沒準備好 commit。

這時候最重要的一個原則是：

> **不要帶著 dirty working tree 去做 checkout 或 rebase。**

---

### 正確的做法

先把目前的修改暫時收起來。

```bash
git stash push -u -m "WIP: before switch to feature/b"
```

Note:
1. -u 表示--include-untracked
2. push可以省略不過留著會讓語意更清楚，直接`git stash`（沒有 subcommand）是快捷寫法

這會把所有修改（包含未追蹤檔案）乾淨地存起來，讓你的 working tree 回到乾淨狀態。

接著，切到同事的遠端新 branch。

```bash
git fetch origin
git checkout -b feature/b origin/feature/b
```

確認你已經站在正確的 branch 上之後，再把剛剛的修改套回來。

```bash
git stash pop
```

如果有衝突，就在這裡處理；處理完之後，再依照正常流程 commit。這樣你得到的 commit，從一開始就是屬於 `feature/b` 的。