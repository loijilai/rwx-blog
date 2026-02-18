---
publish: false
tags:
  - Api-design
date:
---
# REST基本觀念

REST是一種Architectural principle，目的是達成：

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

接著我分成四個部分討論REST Api的設計：[[#Resource]], [[#Operations]], [[#Communication & Performance issue]], [[#Versioning]]。

## Resource
REST 的核心觀念之一，是「**所有東西都是資源（Resource）**」，既然一切都是資源，那 API 的 URI 就是「走到資源的路」。

Resource 設計得好，整個 API 看起來就像自然語言，能夠一眼懂你的資料世界。

### **一、URI 命名：路徑要說得出是什麼**

URI 是 REST 的門牌號。

好的 URI 有三個特點：**用名詞、用複數、用階層關係講故事**。
1. 用名詞，不要用動詞
	因為你不是在描述「做什麼」，你是在描述「操作誰」。
	- GET /orders（正確：你在取資源）
	- POST /orders（正確：你在對 orders 做新增）
	- GET /createOrder（錯誤：你把 API 當成函式庫在呼叫）
2. 用複數形式，讓資源自然形成集合
	- /users
	- /orders
	- /products
	這樣一看就知道是「整個集合」。
3. 用階層關係表達上下文
	URI 不是要模仿資料庫 schema，而是要「用路徑講故事」。
	如：「查某個用戶的訂單」：	
	```
	GET /users/123/orders
	```

	這句話其實已經像英文句子了：「Get user 123’s orders.」
	這就是 REST 最迷人的地方：**資料結構變成語言，而不是變成外洩的 SQL 結構。**

4. Hypertext as the engine of application state（HATEOAS）
	你可以想像 URI 是一連串可以「點下去的路徑」。
	例如查一個訂單時：
	
	```
	{
	  "orderId": 77,
	  "status": "paid",
	  "links": {
	    "cancel": "/orders/77/cancel",
	    "items": "/orders/77/items"
	  }
	}
	```

	雖然很少系統做到這麼完整，但概念上這是 REST 的精神——**透過資源之間的連結表達關係，而不是靠文件硬記。**

### **二、Chatty API vs. Fat API：要一次給多少資料？**

這裡的問題很實際：

- **Chatty API**：Client 要多次 Query 才把資料湊齊
    → Server 壓力大、延遲高、Client 也累
    
- **Fat API**：Server 提供比較「肥」的資料，把關係展開、一次給齊
    → Server 變重、Schema 綁比較深，但 Client 很舒服

這是一種取捨。
原則是：**以使用情境為中心，而不是以資料庫正規化為中心。**
換句話說，**API 是資料庫的抽象層，不是資料庫的複製品。**

### **三、Idempotence：重複打不應該炸掉**
Idempotence（冪等性）意思是：**同一個請求重複送多次，結果應該「一樣」。**

REST 要求：
- GET：查幾次都一樣
- PUT：更新幾次都一樣（因為是整體取代）
- DELETE：刪掉後再刪一次也不應該炸掉

- 只有PATCH和POST 天生不冪等
#### **那 POST 重複送該怎麼辦？（例如 Client 斷線重送）**

我目前知道的解法有三種：
1. 用 DB Unique Constraint 擋住重複插入
	例：email 必須唯一
	當 client 重送相同 payload 時：
	- 第一次：成功
	- 第二次：DB 拒絕（409 或 400）
	這是最簡單也最可靠的做法。
2. 使用 Idempotency-Key
	Client 每次新增都給一個唯一的 Key：
	
	```
	POST /orders
	Idempotency-Key: abc-123-xyz
	```
	Server 記住這個 key：
	- 若第一次成功，回傳結果
	- 若 client 重送同樣 key，回傳一模一樣的結果
1. Business Logic「先查再插」，但可能有 race condition
	單靠「查再插」會遇到 race condition。
	Request A可能查到沒有、準備插，結果剛好Request B也進入查到沒有、準備插，兩個同時通過檢查的Requests，可能同時寫入資料庫。
	
	因此除非搭配：
	- 資料庫 transaction + locking
	- 或是 unique constraint 作為最終保護
	不然不建議單獨使用。

### **四、如果真的不是資源？那就承認它是「功能」，但少用**

REST 強調「URI 表示資源」。
但有些 API 真的不是資源，而是 function-call style。
例如一個加法服務：

```
GET /add?op1=1&op2=33
```

這種用法不是 RESTful，但可以接受，因為它本質不是 CRUD。

原則是：
> **只要不是 CRUD，就不要硬裝成 CRUD；但要保持少量、少量、再少量。**

## Operations

這邊主要講每個HTTP verb的設計，這邊主要講POST, PUT, PATCH三者。

### **1. POST：不是「新增資料」而已**

POST 有兩種語意，而這兩種語意是初學者最常搞混的。

1. Create a new resource（新增一筆）
	
	```
	POST /orders
	```
	
	Server 會：
	- 建立新資源
	- 生成這筆資源的 URI（例如 /orders/987）
	- 回傳 201 Created + Location header

**重點：Client 不該指定 URI，因為那是 Server 的工作。**

2. Submit data for processing（提交資料，讓 server 去處理）
	這類 POST 比較像「呼叫某個動作」，像是：
	- webhook callback
	- job enqueue
	- payment request  
	
	例如：
	```
	POST /jobs
	{
	  "type": "export",
	  "userId": 77
	}
	```
	
	這不一定會創建 “資源”，但語意是「我提交這件事給你處理」。

### **2. PUT：更新，也可以創建，但要符合邏輯**

PUT 的語意是：

> **我把整個資源「放」到你指定的 URI 上。**

1. Client 應該指定 URI
	因為 PUT 是針對「特定資源」：
	
	```
	PUT /products/22
	```
	
	你是在說：「把 22 號商品變成我這次送的內容」。
	
	PUT 本質是 **replace（取代整體）**，不是部分更新。
1. Technical note：Bulk PUT 是合法的
	雖然少見，但你也可以設計：
	
	```
	PUT /products
	[
	  { id: 1, ... },
	  { id: 2, ... },
	  { id: 3, ... }
	]
	```
	
	這種用法是為了避免 chatty API（一次更新大量資料）。
1. PUT 能否同時用來創建資源？（Upsert 問題）
	這取決於：
	
> **Client 是否能在資源還不存在的時候，就能「有意義地」指定它的 URI？**

	
	例如會員自己制定「帳號名稱」：
	
	```
	PUT /users/harper
	```
	
	URI = 使用者帳號 → 這是有意義的自然 key
	
	如果不存在就創建，也是可以接受的。  
	
	但如果你的資源 ID 一定要由 server 產生，那 PUT 就不適合做 creation。
	
	總結：
	
	- 有意義的 client-defined key → PUT 可以 upsert
	- 無意義的 auto-generated key → creation 就只能 POST
### **3. PATCH：局部更新的兩種哲學**

PATCH 是專門處理「我要改一部分就好，不要整筆覆蓋」的情境。  

主要有兩種 patch 模式：**JSON Merge Patch** 與 **JSON Patch**。

#### **(1) JSON Merge Patch（RFC 7386）**

這是最容易理解的：

你傳哪幾個欄位，就更新哪幾個欄位。

例：

```
PATCH /users/33
{
  "nickname": "Harper",
  "avatar": null
}
```

語意：

- nickname → 改成 Harper
- avatar = null → 刪除 avatar 欄位
    
缺點：

- 無法表示陣列內的「局部修改」    
- 無法表示移除陣列某個元素
- null表示刪除，如果真的要設定成null可能會混淆
#### **(2) JSON Patch（RFC 6902）**

不是送資料，而是送「指令」。

例如：

```
[
  { "op": "replace", "path": "/email", "value": "new@example.com" },
  { "op": "remove", "path": "/tags/1" },
  { "op": "add", "path": "/tags/-", "value": "vip" }
]
```

可以：
- 移除陣列中的第 n 個元素
- 在陣列尾端新增
- 對 nested field 做 fine-grain 更新

功能非常強，但：
- 客戶端得懂語法
- 伺服端實作比較複雜
- 一般業務系統不一定需要

實務結論：
**Merge Patch 用得最廣；JSON Patch 是複雜場景才值得用。**

## Communication & Performance issue

### **1. 要怎麼確保 Server 和 Client 說的是同一種語言？**
Answer: 答案在於 HTTP 的 **MIME Type（媒體類型）**。

HTTP 很早就提供了一套語言協商機制：
- Content-Type：**我回什麼格式給你**
- Accept：**我能收什麼格式**

### 2.  **Long Operation 要做 Async API，而不是讓 client 等**
這裡講的 async **不是程式語言的 async/await**，而是 **API 設計層級的非同步模式**。
如果某個動作需要很久，例如：

- 產生大型報表    
- 處理影片
- 執行跨系統的整批資料匯入
- 要做資料科學分析
    
千萬不要讓 Client 一直等到 Timeout。
正確做法是使用 **202 Accepted + Job API**。

### **3. Pagination、Filtering、Projection —— 控制資料量，不只是為了省流量**

Pagination（分頁）、Filtering（過濾）、Projection（挑欄位）、Sorting（排序）
> **如果你不設限，Client 就能毀掉你的 Server。**

#### **(1) Pagination（limit / cursor）**

常見有limit和cursor兩種
```
GET /users?limit=50&offset=100 // limit
GET /users?cursor=8xk39d&limit=50 // cursor-based
```
#### **(2) Filtering（查詢特定條件）**
#### **(3) Projection（挑欄位，避免 over-fetch）**
```
GET /users?fields=id,name,avatar
```
#### **(4) Sorting（排序需要注意 Cache Key）**
提醒：
Query string 通常是 cache key 的一部分，所以：
- sort by name
- sort by date
- sort by email

都會變成不同的 cache bucket。

### **4. 大型檔案要支援 Partial Response**
影音平台、PDF 系統、影片、S3 物件服務…
這類場景都需要支援 **Range Request**。

1. Client 先送 HEAD 要求基本資訊
	```
	HEAD /videos/77
	```
	Server 回：
	```
	Content-Length: 24567899
	Accept-Ranges: bytes
	```
	Client 就知道：
	- 這檔案多大
	- Server 支援部分請求（range）
    
2. Client 發送 Range Request
	```
	GET /videos/77
	Range: bytes=0-1023
	```
	Server 回：
	```
	206 Partial Content
	Content-Range: bytes 0-1023/24567899
	```
	只送前 1024 bytes。
3. Server 必須支援 HEAD + Range 解析
	這需要後端實作：
	- 解析 Range header
	- 片段讀檔
	- 回 206 Partial Content
	- 處理非法 range → 回 416

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


# ASP.NET Core Implementation

## Error handling
ProblemDetails是一種標準格式

1. 先註冊builder.Services.AddProblemDetails()
2. 再用middleware產生problem detail
   * ExceptionHandlerMiddleware: 補上未處理的exception轉成Response
   * StatusCodePagesMiddleware: 補上4xx/5xx而且沒有body的response

# 實務上的問題
1. Create token應該要用POST，因為會對server做出變動，像是存入database、存入redis等等
2. 連續DELETE要回204或是404都沒有違反idenpotence，因為這只是response status code，但是通常會回404
3. GET帶request body不好的原因是許多框架不支援，GET不應該攜帶大量資訊
4. 盡量用JSON object不要用JSON array，因為後者不可擴充（像是分頁或是統計值）
5. 找不到
	|情境|HTTP Status|Body|
	|---|---|---|
	|查列表，無資料|`200 OK`|`[]`|
	|查單筆，不存在|`404 Not Found`|error|
	若是查列表，應該要回傳空陣列，因為語意上是找一個集合，所以應該要回傳空集合，而不是空（空集合不等於空）
6. 

# References
* [Web API Design Best Practices - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design)
	這篇文章可以很好的回答了怎麼設計合理的HTTP status codes

* [Web API Implementation - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-implementation)
* 進步的方法：google oauth playground