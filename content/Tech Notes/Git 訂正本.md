---
publish: true
tags:
date:
comments: true
---
工作以後發現是git指令常常忘記又要一直查，所以這邊整理我遇到的問題。

# 退版
1. 我有很多不需要的改動，要怎麼清空
	1. 只清空「working directory 的改動」：`git restore .`
		- staged（已 git add）
		- 尚未staged
			- modified（已追蹤檔案被改） // <-- 只刪掉這個
			- untracked（新檔案）
	2. 連 staging area 也一起清：`git reset --hard HEAD`
		- staged（已 git add） // <-- 刪掉這個
		- 尚未staged
			- modified（已追蹤檔案被改） // <-- 刪掉這個
			- untracked（新檔案）
	3. 連 untracked 檔案也一起刪（最乾淨）`git reset --hard HEAD + git clean -fd`
		- staged（已 git add） // <-- 刪掉這個
		- 尚未staged
			- modified（已追蹤檔案被改） // <-- 刪掉這個
			- untracked（新檔案）// <-- 刪掉這個，透過git clean -fd
2. 把 file.txt 的內容，強制換成 \<hash\> 這個 commit 裡的版本
	```
	git checkout <hash> -- file.txt
	git restore --source=<hash> file.txt // 這是新版 Git 推薦的用法，比 checkout 更安全
	```
3. 不小心commit不需要的檔案，想把檔案從版本控制中完全移除
   ```
	   git rm --cached <file>
	   git commit
	```
4. 暴力退版：把你的整個工作目錄、暫存區（index）、HEAD 全部強制回到指定的 commit 狀態，之後的修改全部丟掉
	```
	git reset --hard <hash> // 小心使用，非常暴力
	```
5. 把不小心 commit 的檔案還原到「commit 前的乾淨狀態」但「把最新內容留在工作目錄」
	```
	git reset --soft HEAD~1
	```
	- 當前 commit 被取消（回到 commit 前）
	- 你的檔案內容全部保留
	- 之前加進 staging 的檔案仍在 staging area，你可以自行 unstage 或調整

# Fetch & Pull
1. git fetch是只fetch當前branch的upstream branch還是全部都會fetch?
	Answer: 全部的upstream branch都會fetch
2. 問題同上，那git pull呢？
	Answer: git pull = git fetch + git merge <目前 branch 的 upstream branch>，所以是全部的branch都會fetch，只會merge「目前 branch 所追蹤的 upstream branch」

# 情境

我目前在dev branch上已經有一些modified file，但是同事在遠端開了新branch，我需要改成在同事的遠端新branch後續開發，我可以怎麼把本地更新成遠端狀態，然後再把我目前的改動apply上去?

## Case 1. dev branch還沒有commit

1. 確認狀態
	```
	git branch --show-current // 應該顯示 dev
	git remote -v // 確認你用的是對的遠端（通常叫 origin）
	```

2. 現在有 modified file，最安全就是先 stash。
	```
	git stash push -u -m "看要打什麼訊息"
	```
	Note: 
	1. -u 表示--include-untracked
	2. push可以省略不過留著會讓語意更清楚，直接`git stash`（沒有 subcommand）是快捷寫法

3. 把遠端最新狀態抓下來（包含新 branch）
	```
	git fetch --all --prune
	git branch -r // 應該要看到遠端新 branch: origin/feature/new-branch
	```
4. 切到「遠端新 branch」並建立本地追蹤分支
	```
	git switch -c feature/new-branch --track origin/feature/new-branch
	git branch // 應該要在feature/new-branch上
	git log --oneline // 應該要看到HEAD -> feature/new-branch, origin/feature/new-branch
	git status // 乾淨
	```
5. 把剛剛的改動套回來
	```
	git stash apply // apply不會立刻刪掉 stash，比較安全
	git status // 應該又回到第一步驟的狀態
	
	> 如果有衝突：Git 會標出 conflict 檔案。
	> 修改衝突後
	git add <衝突檔案...>
	git status // 直到 status 不再顯示 unmerged paths
	
	> 確定都沒問題後，再把 stash 刪掉
	git stash drop
	git stash list // 不見了
	```
3. 提交新的改動
	add, commit, push

## Case 2. dev branch已經commit

跟Case 1的差異是dev branch 上已經 commit 過一些改動，目標把「dev 上新增的 commit」搬到「遠端新 branch」後面。


1. 確認目前狀態
	```
	git branch --show-current     # 應顯示 dev
	git status                   # working tree 應為乾淨
	git log --oneline
	```
	確認重點：
	- 改動都已經是 commit
	- 沒有殘留 modified / staged 檔案

2. 抓取遠端最新狀態（包含新 branch）
	```
	git fetch --all --prune
	git branch -r // 應該要看到 origin/feature/new-branch
	```

3. （可選）建立本地追蹤分支  
   不是必要，但可讓 branch 關係更清楚
	```
	git branch feature/new-branch origin/feature/new-branch
	```

4. 將 dev 上的 commit rebase 到遠端新 branch 上
	```
	git checkout dev
	git rebase origin/feature/new-branch
	```
	rebase 在做什麼？
	- 找出 `dev` 相對於原本 base 的 commit
	- 將這些 commit：
	    - 一個一個重新套用
	    - 接在 `origin/feature/new-branch` 後面
	        
	結果示意：
	
	```
	origin/feature/new-branch --- B1 --- B2
	                                      \
	                                       D1 --- D2   (原本在 dev 的 commit)
	```

5. 若發生衝突
	Git 會在衝突處停下來。
	正確處理流程：
	```
	# 手動解衝突
	git add <衝突檔案...>
	git rebase --continue
	```
	⚠️ 注意事項：
	- **不要**執行 `git commit`
	- **不要**執行 `git merge`
	- 直到出現：Successfully rebased and updated refs/heads/dev.

6. 驗證 rebase 結果
	```
	git log --oneline //  `dev` 的 commit全部接在 `origin/feature/new-branch` 之後
	```

7. 後續處理方式：改成在 feature/new-branch 繼續開發
	```
	git checkout -B feature/new-branch
	git push --force-with-lease origin feature/new-branch
	```
	適合情境：
	- `dev` 只是暫時中繼
	- 後續開發以 `feature/new-branch` 為主