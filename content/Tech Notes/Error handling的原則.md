---
publish: false
tags:
date:
---
我的做法：
[Handle errors in ASP.NET Core APIs | Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling-api?view=aspnetcore-10.0&tabs=controllers)
每個層級的職責不同：DB不管unique constraint exception，直接往上丟。service負責把unique constraint exception 抓住，轉換成商業邏輯的exception，丟出business exception，最後給controller抓住，再回傳對應的http status code，而其他非business exception的就交給最外層middleware處理


[https://github.com/gothinkster/aspnetcore-realworld-example-app](https://github.com/gothinkster/aspnetcore-realworld-example-app)
我在這個repo學到
- **MANDATORY**: Use exceptions for abnormal or unexpected program behavior.
- **ALWAYS** provide helpful error messages when throwing exceptions.
- **NEVER** use exceptions for normal flow of control.
- `recommended`: Prefer `try/catch` over returning error codes.