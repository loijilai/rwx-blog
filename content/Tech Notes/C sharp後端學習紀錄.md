---
publish: false
tags:
date:
---
# TODO
[[JWT 驗證與授權]]
[[Rest API design]]
[[Error handling的原則]]
[[Result pattern]]

# 基礎學習內容

以下是我用C#和Asp.Net core進行後端開發的學習紀錄。

1. C# basic  
	* [[null 合併運算子]]
	* https://youtu.be/GhQdlIFylQ8?si=cr4g7qeQs-98qtFv
2. ASP.NET Core  
   [ASP.NET Core Full Course For Beginners (youtube.com)](https://www.youtube.com/watch?v=AhAxLiGC7Pc)
	1. Middleware
	2. [[Dependency injection]]
	3. controller & 基本的api routing design
	4. [[如何讀取appsettings.json]]
3. Api design, architecture: controller, services, repository
	* [[Rest API design]] 
	* [[Error handling的原則]]

4. SQL server & EF core
	* LINQ最基本的重要觀念：
		1. Deferred execution
		   e.g. 就算tracks是List，寫tracks.Select(t => t.ToDto())會變成IEnumerable而非List，除非最後加上.ToList()
		2. IEnumerable (在memory中）vs. IQueryable（會實際轉換成DB query）
		3. LINQ主要用於查詢的Query居多，像是where, select, order by, first/firstOrDefault, any, tolist
		4. 如果要update, create, delete就要用到LINQ之餘的Add, Remove + saveChangesAsync() 這些不是IQueryable，是DbSet的操作介面。有時候兩種方法都可以做到同一件事情，像是var problem = context.Problems.FindAsync(id) vs. var problem = context.Problems.FirstorDefaultAsync(p => p.id == id)，這時候優先會選擇前者，FindAsync雖然不是IQueryable提供，但是他是專門用來查詢primary key的，而且可以利用ef core的change tracker直接回傳不用查詢DB
5. Docker & Docker compose  
   https://youtu.be/SXwC9fSwct8?si=7WOcEntMdszmEbLd  
   困難點：服務之間啟用的dependency、用環境變數覆蓋appsetting、volumn與network設定(服務內部溝通要用內部網路的service name和port溝通，而不是windows/mac上面的port)
6. Unit testing (xUnit + Moq)  
   * 困難點：如果沒有對app做分層，會很難測試，正確的單元測試會集中在service的部分
   * [[為什麼要寫測試？]]
1. Kubernetes  
   [Kubernetes Crash Course for Absolute Beginners [NEW] (youtube.com)](https://www.youtube.com/watch?v=s_o8dwzRlu4)  
   困難點：  
   * 理解每個k8s components在做什麼？secret, configmap, deployment, services
   * 理解service要怎麼把target port對應到pod，然後deployment是怎麼找到個別的pod的？(keyword: matchLabels & labels & nodeport)
1. GitLab CI/CD + Argo CD  
   [GitLab CI CD Tutorial for Beginners [Crash Course] (youtube.com)](https://www.youtube.com/watch?v=qP8kir2GUgo)  
   [ArgoCD Tutorial for Beginners | GitOps CD for Kubernetes (youtube.com)](https://www.youtube.com/watch?v=MeU5_k9ssrs)  
    困難點： Docker in docker才能push to docker hub, 然後ci pipeline要能夠修改manifest file才能觸發argocd
2. App observability
   * 先用這個影片理解observability到底是什麼？ https://youtu.be/PT-Bjs6iCug?si=a4KV1fS2JSml5j2e 
   * 然後用官方文檔理解Asp.Net Core中要怎麼引入？ [Example: Use OpenTelemetry with Prometheus, Grafana, and Jaeger - .NET | Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-prgrja-example)
   * 我只有Trace和Metric走opentelemetry，而log我是採用這個連結提供的方法  
     [[Day17] Serilog & Seq 為你打造良好的Log管理環境- 我與 ASP.NET Core 3 的 30天 - iT 邦幫忙::一起幫忙解決難題，拯救 IT 人的一天 (ithome.com.tw)](https://ithelp.ithome.com.tw/articles/10247300)
   * 整體的配置如下，全部用docker-compose跑起來
	   	1. Structured logging: Serilog + Seq
	   	2. Distributed tracing: Opentelemetry + Jaeger
	   	3. Metrics: Prometheus + Grafana
4. [Git/GitHub/GitLab完全教程（包括Git底层原理） | Udemy](https://www.udemy.com/course/git-basic/?couponCode=KEEPLEARNING)
	* [[Git 訂正本]]
5. [[JWT 驗證與授權]]

# 實務開發學習內容

1. 當Api A需要呼叫Api B取得資料，就需要用到[[如何使用HttpClient呼叫其他服務]]
2. [[Result pattern]]
3. [[GraphQL]]

# 困難點
1. DB design (constraint, index)
2. Api design, architecture: controller, services, repository （上面的第三點）
3. 框架的運作原理  
   我大致上知道用某些code可以設定某些功能，但我不太懂框架到底是怎麼運作的，導致我寫不出這些code。基本上只是框架的user，我想要學習更底層的東西該怎麼做。舉個比較specific的例子，我不知道這段code背後是怎麼運作的，只知道我這樣設定就會這些功能
   ```csharp
      // AddOpenTelemetry: Registers an IHostedService to automatically 
      // start tracing and/or metric services in the supplied IServiceCollection
      // and then returns an OpenTelemetryBuilder class.
      appBuilder.Services.AddOpenTelemetry() 
	      .ConfigureResource(builder => builder.AddService(serviceName: "MyService")) 
	      .WithTracing(builder => builder.AddConsoleExporter()) 
	      .WithMetrics(builder => builder.AddConsoleExporter());
   ```

# 學習方法調整

1. 先混亂再整理，而非先理解再實作
	* 工作以後才發現這種學習模式：模仿 -> 實作 -> 發現規則 -> 理解
	* 既有的程式庫就是最好的老師，幾乎所有問題都可以找到，像是讀取設定檔、call其他服務要怎麼寫等等
2. 定期整理gpt的聊天記錄，整理成blog post
3. 如果學習的內容是觀念，做一個小例子驗證，確保自己能夠教人才算是懂