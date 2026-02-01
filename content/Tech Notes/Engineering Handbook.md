---
publish: true
tags:
date:
---
> [!tip] 入口
> * [[為什麼我想當軟體工程師？]]
> * [[得到我的第一份後端工程師工作]]
> * [[軟體工程學習紀錄]]
> * [[系統設計目錄頁]]
# 我可以進步的清單

## 工具使用
- [x] [[LINQ 練習題]]
- [x] Visual studio
	- [x] 跳轉implementation
	- [x] 檔案路徑 (ctrl ,)
	- [x] search all text (ctrl shift f)
	- [x] search all file (same as above)
	- [x] git
	- [x] copilot
	- [x] Run docker file
	- [x] toggle solution explorer
- [ ] [[Elasticsearch]] [Beginner's Crash Course to Elastic Stack - Part 1: Intro to Elasticsearch and Kibana (youtube.com)](https://www.youtube.com/watch?v=gS_nHTWZEJ8)
- [x] git & source tree [https://gitbook.tw/](https://gitbook.tw/)
- [ ] postman
- [ ] AI
	* https://www.kdnuggets.com/finding-meaningful-work-in-the-age-of-vibe-coding
	- https://www.scotthyoung.com/blog/2025/11/12/vibe-coding-future-work/
## 資料庫
- [x] [[Kafka 入門：為什麼它能讓微服務解耦、又快又穩]]
- [ ] mongoDB
- [ ] Redis: 要設定哪些Key？要存什麼Value？要用什麼Redis data structure？要怎麼設定expire time？要怎麼配合業務流程取用和更新資料以達成某種功能？
- [ ] mssql [https://youtu.be/SSKVgrwhzus?si=Luq0OL3ckEys6JAl](https://youtu.be/SSKVgrwhzus?si=Luq0OL3ckEys6JAl)
- [x] SQL server management studio

## 工程素養(設計)
- [x] OpenAPI [https://learn.openapis.org](https://learn.openapis.org/)
- [ ] [[Csharp Clean Code]]
	- [ ] OOP & Design pattern
	- [ ] API design
	- [ ] Error handling
- [ ] [System Design Interview – An Insider's Guide](https://www.tenlong.com.tw/products/9798664653403)
	- 這次有遇到[[Cache design]]的問題
	- [[系統設計目錄頁]]
- [ ] Mircroservice [.NET Microservices. Architecture for Containerized .NET Applications - .NET | Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)
- [ ] [简介 · ddia-cn (gitbooks.io)](https://vonng.gitbooks.io/ddia-cn/content/)

## Domain & system big picture
- [ ] 不知道目前在維護的系統到底長什麼樣子
- [ ] Kong, fabio?

## Soft skills
-  溝通：每次問問題+得到回覆都花很多時間，常常問題的方向不對，又或是透過訊息很難表達
- 工作的方式：這次拿到需求，沒有先釐清需求就開始做，浪費一些時間
- 不要糾結：趕快推一版上去，讓其他人能夠code review
- 勇敢地問，但在問問題之前先問自己五次為什麼，釐清問題在哪裡
- 主動報告進度：在Daily時sync up自己的bottleneck，明確的說出自己現在進度到幾%
- 開發習慣：讓code在正式deploy的狀態（docker能跑、設定檔同部署環境）
	- Consul設定成False，然後用appsetting.Development.json
	- development直接連consul
* Code review
	* 盡量一天發一個MR就好，不然reviewer不知道我到底正在開發還是可以merge了
	* 每個commit要小，這樣reviewer才知道要怎麼review
	* 發MR之前要確定可以compile + test
	* YAGNI: 要克制自己不要去修其他東西，專注在這次需求的交付就好
	* 可以問 mentor：建議這樣改的原因是什麼？code的意圖要明顯易懂，先從意圖開始思考