---
publish: true
tags:
  - csharp
date:
---
## 基本原則

需要建立的觀念：不要用 static 儲存可變狀態，改由 DI 容器管理物件生命週期。

## 正確的替代策略

- 全域資料 → 用 Singleton DI
- Request 資料 → 用 Scoped DI，避免跨請求污染
- 設定資料 → 用 IOptions / IOptionsMonitor
- 常數 → 才用 static readonly 或是 const

# References
[Dependency injection in ASP.NET Core | Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection?view=aspnetcore-9.0#lifetime-and-registration-options)