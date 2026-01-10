---
publish: true
tags:
date:
comments: true
---
1. Dockerfile的位置：Dockerfile 放在 “要被建置成容器的那個 project 資料夾下”，而不是 solution 根目錄
	```
	MySolution/
	│
	├── MyApi/
	│   ├── Dockerfile   ← 放這裡
	│   └── *.csproj
	│
	└── MyWorker/
	    ├── Dockerfile   ← 也放這裡
	    └── *.csproj
	```
1. Dockerfile裡面寫的路徑是相對於誰？Answer: Build Context  
	Build Context是蝦米毀？
	`docker build -f MyApi/Dockerfile -t myapi .`
	最後那個 **.** 就是 build context 的根。Dockerfile 裡的相對路徑都是從這個 context 開始。
2. 要怎麼在跑Dockerfile的時候改變環境？  
   `-e ASPNETCORE_ENVIRONMENT=Development`