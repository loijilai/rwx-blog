---
publish: true
tags:
date:
comments: true
---
取「訂正本」這個名字是因為，以前當學生的時候模考，會發現自己同樣的題目一錯再錯，除非做訂正本並常常複習才會記起來。結果工作以後發現是git指令常常忘記又要一直查，所以這邊整理我遇到的問題。

1. 把 file.txt 的內容，強制換成 \<hash\> 這個 commit 裡的版本
	```
	git checkout <hash> -- file.txt
	git restore --source=<hash> file.txt // 這是新版 Git 推薦的用法，比 checkout 更安全
	```
2. 不小心commit不需要的檔案，想把檔案從版本控制中完全移除
   ```
	   git rm --cached <file>
	   git commit
	```
3. 暴力退版：把你的整個工作目錄、暫存區（index）、HEAD 全部強制回到指定的 commit 狀態，之後的修改全部丟掉
	```
	git reset --hard <hash> // 小心使用，非常暴力
	```
4. 把不小心 commit 的檔案還原到「commit 前的乾淨狀態」但「把最新內容留在工作目錄」
	```
	git reset --soft HEAD~1
	```
	- 當前 commit 被取消（回到 commit 前）
	- 你的檔案內容全部保留
	- 之前加進 staging 的檔案仍在 staging area，你可以自行 unstage 或調整