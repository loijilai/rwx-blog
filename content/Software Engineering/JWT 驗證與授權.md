---
publish: false
tags:
date:
---
# Concept

1. Authentication 驗證：你是誰(Identity)？他不會阻擋請求，而是建立身分證
2. Authorization 授權：你有權限嗎？

# 流程

1. UseAuthentication middleware攔截
2. Middleware解析JWT, 驗證簽章、有效期、Issuer等等，並提取claim放入HttpContext
3. Controller authorize

# 問題
* 如何產生JWT token?
	`dotnet user-jwts`
* OpenID Connect是什麼？
	OpenID Connect = OAuth 2.0 + authentication 標準化授權流程，其實就像是上面講的JWT驗證與授權流程，只不過規範更標準
* JWT token內部有什麼？
  有三個部分：header(紀錄一些演算法和type)、body、signature就是把header和body加密起來
	body的內容：issuer: API, audience: frontend(這個API可以用在哪裡), subject: Name, 還可以增加role/name/clai

# Reference
[ASP.NET Core JWT Authentication and role-based authorization (youtube.com)](https://www.youtube.com/watch?v=wVFfPrB5kEw&list=PLeD0-5Hw0ZJ8U7NmCqObexO-mnuts2vi1&index=8)