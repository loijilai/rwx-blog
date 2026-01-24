---
publish: true
tags:
date:
comments: true
---
在開發過程中，提交錯誤的 commit 幾乎是必然會發生的事情。

常見的情境包括：功能完成後並送出 Merge Request（MR），才發現其中混入了除錯用程式碼。此時，多數人會直覺地想把分支退回到正確狀態，卻很快遇到一個問題：本地 reset 之後，卻怎麼樣都推不上去。

這篇文章將從實際開發流程出發，說明為什麼這種情況會發生，並完整整理在不同階段下，應該選擇 `git reset` 還是 `git revert`，以及在已經送出 MR 的前提下，如何在不破壞團隊協作的情況下修正錯誤。

---

## reset 與 revert，真正的差別在於「歷史」

> 公開分支，永遠用 revert，不用 reset

在修正錯誤 commit 時，`git reset` 與 `git revert` 都能讓程式碼回到正確狀態，但兩者對待歷史的方式完全不同。

`git reset` 會「改變歷史」，使錯誤的 commit 從歷史中消失，就像從未存在過一樣，因此一旦這些 commit 已經存在於遠端，就必須透過 force push 才能同步。

`git revert` 則採取相反的策略。它不會移除任何既有 commit，而是新增一個新的 commit，內容是將指定 commit 的修改反向套用。歷史會完整保留下來，修正的過程也清楚可追蹤。

---

## 情境：已經送出 MR

### 什麼情況適合使用 reset

```bash
git reset --hard HEAD~2 // 舉例，退兩個commit
git push --force-with-lease
```

即使 MR 已經送出，只要仍處於「審查中、尚未完成核准、你確定只有你在用這個 branch」，技術上仍然可以使用 `git reset --hard` 搭配 `git push --force-with-lease` 來整理 commit 歷史。這麼做會直接更新遠端分支，MR 內容也會同步反映最新狀態。

### 什麼時候應該改用 revert

```bash
git log --oneline

c3 ❌ wrong commit 2
c2 ❌ wrong commit 1
c1 ✅ correct commit
```

```bash
git revert c3
git revert c2
git push
```

當 MR 「已經被 reviewer 留言甚至核准、上游有人可能已經拉過」時，再改寫歷史往往會帶來額外成本。原本針對特定 commit 留下的審查意見，可能會因為歷史被重寫而失去對應關係，導致溝通變得困難。

在這種情況下，使用 `git revert` 以新增 commit 的方式修正錯誤，通常是更合理的選擇。

---

## 為什麼 force push 時應該使用 --force-with-lease

當必須改寫遠端歷史時，`git push --force-with-lease` 是相對安全的選擇。它會在推送前確認遠端分支的狀態是否仍與你上次取得時一致，若期間已有其他更新，推送就會被拒絕，避免不小心覆蓋他人的提交。

> `lease` =「我假設遠端還停在我上次看到的位置，如果這個假設不成立，我不動。」