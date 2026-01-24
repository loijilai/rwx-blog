---
publish: true
tags:
date:
comments: true
---
工作以後發現是git指令常常忘記又要一直查，所以這邊整理我遇到的問題。

## 我有很多不需要的改動，要怎麼清空？

這邊介紹最容易搞混的三個指令：`git reset`, `git restore`, `git clean -fd`

![[git-restore-reset-clean.png]]

### 影響區域

以上張圖是我自己畫的，箭頭指向的位置表示影響區域：

1. `git restore`是把 Working Directory 的Modified (Tracked) Files清除，恢復成 Index 的狀態
	* 情境：我只是亂改了一堆檔案，但 add 過的東西我想留著
2. `git reset --hard HEAD`是把 Index 和 Working Directory 都強制對齊到 HEAD commit
	* 注意上圖的例子都是reset搭配HEAD，事實上也可以直接指定要回到哪一個hash的狀態：`git reset --hard <hash> // 小心使用，非常暴力`
3. `git clean -fd`
	* 只有這個指令可以處理Untracked Files
	* -f 代表force，一定要-f才能真正刪除
	* -d 代表會recurse into untracked directories，如果有untracked files躲在資料夾裡面就要用這個
	* 如果想要安全一點可以先用 `git clean -fdn   # n = dry-run，不真的刪`

### 補充：git reset的三種模式

- **--soft**：只後悔 _commit_，不後悔 `git add`
- **--mixed（預設）**：後悔 _commit_，也後悔 `git add`
- **--hard**：全部後悔

| 模式            | HEAD | Staging Area (Index) | Working Directory |
| ------------- | ---- | -------------------- | ----------------- |
| `--soft`      | ✅ 移動 | ❌ 不動                 | ❌ 不動              |
| `--mixed`（預設） | ✅ 移動 | ✅ 清空                 | ❌ 不動              |
| `--hard`      | ✅ 移動 | ✅ 清空                 | ✅ 清空              |

`git reset --soft HEAD`在[[#我有很多不需要的改動，要怎麼清空？]]這個情境沒有任何作用，因為把HEAD移動到HEAD沒有退回任何commit，再加上`--soft`是 staging area 和 working directory 都不動，所以整體沒有作用。

`--soft` 只有在指定 `<hash>`、且你刻意想保留 staged 狀態（例如改 commit message、拆 commit）時才有意義；相較之下，`--mixed` 更符合大多數「反悔 commit」的實際需求。

## 其他情境

1. [[如何安全地帶著你的commit切換到同事的新 branch繼續開發]]
2. [[拆分混在同一個 Git Branch 的兩個 Feature：用 cherry-pick 把提交拆乾淨]]
3. [[同時開發且有依賴的兩個 Feature：用 rebase 建立可 review 的 Stacked MR]]
4. [[已送出 MR 後，該如何處理錯誤的 commit]]

5. 把 file.txt 的內容，強制換成 \<hash\> 這個 commit 裡的版本
	```bash
	git checkout <hash> -- file.txt
	git restore --source=<hash> file.txt // 這是新版 Git 推薦的用法，比 checkout 更安全
	```
6. 不小心commit不需要的檔案，想把檔案從版本控制中完全移除
   ```bash
   	git rm --cached <file>
	git commit
   ```

## 觀念

### Fetch & Pull
1. `git fetch`是只fetch當前branch的upstream branch還是全部都會fetch?
	* Answer: 全部的upstream branch都會fetch
2. 問題同上，那`git pull`呢？  
	* Answer: `git pull` = `git fetch` + `git merge <目前 branch 的 upstream branch>`
	* 所以從第一點知道，`git fetch`是全部的branch都會fetch，但是`git merge`只會merge「目前 branch 所追蹤的 upstream branch」