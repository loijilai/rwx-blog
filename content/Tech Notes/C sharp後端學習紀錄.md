---
publish: true
tags:
date:
---
# 學習內容
1. C# basic  
   https://youtu.be/GhQdlIFylQ8?si=cr4g7qeQs-98qtFv
2. ASP.NET Core  
   [ASP.NET Core Full Course For Beginners (youtube.com)](https://www.youtube.com/watch?v=AhAxLiGC7Pc)
	1. middleware
	2. dependency injection
	3. controller & 基本的api routing design
	4. 如何讀取appsettings.json
	5. app architecture: controller, services, repository
3. SQL server & EF core
4. docker & docker compose  
   https://youtu.be/SXwC9fSwct8?si=7WOcEntMdszmEbLd  
   困難點：服務之間啟用的dependency、環境變數、volumn與network設定
5. Unit testing (xUnit + Moq)  
   困難點：如果沒有對app做分層，會很難測試。通常正確的單元測試會集中在service的部分，但我卻讓controller直接取得資料庫
6. Kubernetes  
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
1. [Git/GitHub/GitLab完全教程（包括Git底层原理） | Udemy](https://www.udemy.com/course/git-basic/?couponCode=KEEPLEARNING)


# 困難點
1. DB design (constraint, index)
2. API design (naming, error handling)
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
