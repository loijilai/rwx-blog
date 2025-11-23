---
publish: false
tags:
date:
---
# REST基本觀念

他是一種Architectural principle，目的是達成：

- Client 與 Server 的鬆耦合（Loosely Coupled）
- Server 無狀態（Stateless）

1. Loosely Coupled：前後端可獨立演進  
	鬆耦合讓前端與後端能各自進化，但前提是「契約」必須穩定且清晰。這個契約包括：
	- Routing 設計（URI 結構）
	- 回傳格式（JSON / XML 結構一致性）
	- HTTP Status Code 的正確使用
	- 錯誤回應的標準化
2. Stateless：讓系統具備橫向擴展能力
	Server 不保存 Client 狀態，意味著當後端在 Kubernetes 中從 5 個 Pod 擴展到 10 個很容易，因為
	- 任一請求都能由任一節點處理
	- 不依賴特定 Server Instance
	- 更易於負載平衡與自動擴展

REST = Representational State Transfer
- **Representational**
    資源以 JSON / XML 等格式表達，是資源的「可序列化樣貌」。
- **State**
    指的是資源的狀態，不是 Server 的 Session。
- **Transfer**
    透過 HTTP Verb（GET / POST / PUT / DELETE 等）進行狀態轉移。

一句話：用HTTP表達你的資料世界。抽象來看，就是對「商業實體」及「對它們的操作行為」，包裝成網路語言的方式。

# 設計上的考量

## Resource
這邊主要講怎麼設計URI能夠表示資源
1. URI naming
	noun, plural, relationship (階層關係、Hypertext as the engine of app state), chatty vs fat web API (chatty的意思是client要一直query才能把資料拿齊，server會很累，fat api的意思是denormalize一些，可以一次拿到多一點資料，這兩者之間是一種取捨), 不要暴露database internal structure，可以想像API = abstraction of the database，也就是讓client可以與db schema分離
2. Idempotence
   * GET, PUT, DELETE, PATCH都要符合idempotence
   * POST不符合idempotence，所以要怎麼處理replicate POST?
	1. DB unique constraint
	2. Idempotency-key
	3. Business logic先查再插入，但是這樣不會有race condition嗎？

NOTE: URI應該要表示資源，那如果就真的不是在操作資源怎麼辦？可以用類似"function-call" API，但要少用
e.g. GET /add?op1=1&op2=33

## Operation
這邊主要講每個HTTP verb的設計

1. POST語意有兩種，一個是新增資料，一個是submit data for processing，不該讓client指定URI
2. PUT 
	1. client應該要指定URI，一般來說是apply to individual entity，但也可以implement bulk HTTP PUT減少chatiness
	2. 要不要讓PUT endpoint support creation? 這要看client是否能夠有意義的assign URI before這個資源存在？
3. PATCH主要有兩種模式：
	* JSON Merge Patch 最直觀，局部JSON + null data表示delete
	* JSON Patch 直接傳指令，實作比較複雜但功能強大

## Communication & Performance issue
1. Server和Client如何能夠確保彼此交換同一種格式？
	Answer: Resource MIME Type (Content-Type表示告訴對方我回什麼, Accept表示告訴對方我收什麼)
2. Implement async method
	這邊講的不是程式語言層級的async，而是API設計層級，如果有long-operation要用async API
3. Implement data pagination & filtering
	這可以prevent DOS，常見的做法有pagination (limit), filtering (filter出row), projection (選出column), sorting (注意sorting會是不同cache key, 因為query string通常是cache key的一部分)
4. 大型檔案要support partial response
	Mechanism: 
	1. client先送HEAD得到server回應Content-Length & Accept-Range
	2. client在用range header去request server
	3. server要支援HEAD並能夠解析range header

## Versioning
Versioning的動機很簡單，能夠持續演進又要能夠backward compatability，常見四種方法
1. URI versioning
   public API最常用，好處是可以CDN cache，壞處是URI被污染資源表示
2. query string versioning
	versioning照理講只是取用的方式不同，所存取的資源仍然是同一個，所以URI語意較清楚，壞處是容易cache miss，因為query string也是cache的一部分（但是如果version少，這樣不就還是很容易cache嗎？這段在講什麼鬼）
3. header versioning
	一樣URI很pure，但前端會不直覺需要帶上header，需要client可控的環境
4. MIME versioning
	Rest理論派最愛，符合content-negotiation的精神，版本放在media type比較合理，但是比較難實作（難在哪？）


# Implementation

## Error handling
ProblemDetails是一種標準格式

1. 先註冊builder.Services.AddProblemDetails()
2. 再用middleware產生problem detail
   * ExceptionHandlerMiddleware: 補上未處理的exception轉成Response
   * StatusCodePagesMiddleware: 補上4xx/5xx而且沒有body的response

# References
* [Web API Design Best Practices - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design)
	這篇文章可以很好的回答了怎麼設計合理的HTTP status codes

* [Web API Implementation - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-implementation)