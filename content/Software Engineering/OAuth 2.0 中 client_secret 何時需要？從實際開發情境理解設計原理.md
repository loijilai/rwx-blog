---
publish: true
tags:
date:
comments: true
---
在實際開發中，許多工程師第一次接觸 OAuth 2.0 時，往往是在串接第三方登入或 API。

例如你正在開發一個網站，想讓使用者使用 Google 帳號登入；或你正在做一個前端單頁應用（SPA），需要呼叫某個受保護的 API。

## 前情提要

在你開始跑 OAuth2.0 protocol flow之前，你的應用程式（client）必須先在 Authorization Server 那邊登記過。

舉個實際的例子，你需要先到 Google Cloud Platform 註冊一個OAuth2.0 Client，這個 Client 就是你正在開發的網站，而 GCP 在這裡就是 Authorization Server的角色。註冊的階段需要填入 Client Type、Redirect URL，註冊完畢後，GCP 會給你兩個值：`client_id` 與 `client_secret`。

> 這步驟很關鍵，不是臨時出現一個 App 就能直接來要 token，註冊是讓 Authorization Server 知道有這個 Client 要來使用第三方登入的功能

此時常見的疑問是：這個 client_secret 什麼時候使用？為什麼純前端應用卻不能使用它？如果沒有 client_secret，授權伺服器又怎麼知道這是一個合法註冊的應用？

要回答這些問題，必須回到 OAuth 2.0 的官方規範。

---

## 一個常見的開發場景

Source: [RFC 6749 - The OAuth 2.0 Authorization Framework (ietf.org)](https://datatracker.ietf.org/doc/html/rfc6749)
```
     +--------+                               +---------------+
     |        |--(A)- Authorization Request ->|   Resource    |
     |        |                               |     Owner     |
     |        |<-(B)-- Authorization Grant ---|               |
     |        |                               +---------------+
     |        |
     |        |                               +---------------+
     |        |--(C)-- Authorization Grant -->| Authorization |
     | Client |                               |     Server    |
     |        |<-(D)----- Access Token -------|               |
     |        |                               +---------------+
     |        |
     |        |                               +---------------+
     |        |--(E)----- Access Token ------>|    Resource   |
     |        |                               |     Server    |
     |        |<-(F)--- Protected Resource ---|               |
     +--------+                               +---------------+

                     Figure 1: Abstract Protocol Flow
```

假設你正在開發一個筆記網站，並希望讓使用者用 Google 帳號登入。整個流程涉及四個角色，這是 OAuth 2.0 在 RFC 6749 中定義的核心模型：

- **Resource Owner**：使用者
    
- **Client**：你的筆記網站
    
- **Authorization Server**：Google 的授權伺服器
    
- **Resource Server**：Google 的 API（例如使用者資訊 API）
    

當使用者點擊「使用 Google 登入」時，瀏覽器會被導向 Google 的 Authorization Server。使用者同意授權後，Google 會將使用者導回你註冊時指定的 redirect URI，並附上一個 authorization code(Authorization grant的一種)。以上就完成了(A)和(B)。

接著你的應用會用authorization code 向 Google 交換 access token（步驟C和D），然後再使用 access token 去呼叫 Resource Server（步驟E和F）。

問題就出現在這裡：交換 access token 時（步驟C和D）是否需要帶 client_secret？

---
## 官方規範如何定義 Client 類型

RFC 6749 第 2.1 節將 Client 分為兩種：

1. **Confidential Client**：能夠安全保存憑證（例如後端伺服器）。
    
2. **Public Client**：無法安全保存憑證（例如瀏覽器內的 JavaScript 或安裝在使用者裝置上的應用）。

Confidential Client 可以使用 client_secret 來向 Authorization Server 進行身份驗證。這種情況常見於後端 Web 應用：Authorization code 回到後端伺服器後，由後端伺服器帶著 client_id 與 client_secret 向授權伺服器交換 Access token。

但 Public Client 無法安全保存 secret，因此規範明確指出不應依賴 client_secret 作為安全機制。任何部署在使用者裝置上的程式碼，都可能被檢視或反編譯，因此 secret 不再是秘密。

---

## 那麼，沒有 client_secret 如何辨識合法應用？

在 Public Client 的情境下，授權伺服器並不是透過 client_secret 來辨識身份，而是透過以下方式：

首先，`client_id` 仍然是必須的。它是一個公開識別碼，用來告訴授權伺服器是哪一個註冊過的應用正在發起請求。授權伺服器會檢查這個 client_id 是否存在，以及請求中提供的 redirect URI 是否與註冊資訊完全匹配。

redirect URI 的精準匹配是 OAuth 安全模型的重要部分。它確保授權碼或 token 只會傳送到註冊時指定的位置，而不是任意網址。

然而，client_id 本身無法提供強身份驗證。這正是為什麼後來引入了 PKCE（RFC 7636）。

---
## 實務判斷方式

當你在開發時，可以用一個簡單問題判斷是否應該使用 client_secret：

這段程式碼是否只在你的後端伺服器上執行？

如果是，並且該伺服器能安全保存憑證，那它屬於 Confidential Client，應使用 client_secret。

如果程式碼會出現在使用者的瀏覽器或裝置上，那它屬於 Public Client，不應依賴 client_secret，而應使用 PKCE 等官方建議的機制。

---
## 總結

OAuth 2.0 並不是要求所有 Client 都必須透過 client_secret 驗證身份。相反地，規範清楚區分了能安全保存秘密的應用與無法保存秘密的應用。對於 Public Client，授權伺服器透過 client_id、redirect URI 精準匹配，以及 PKCE 等機制來維持流程安全，而不是透過 client_secret。

理解這一點，可以幫助你在設計 OAuth 架構時做出正確的安全決策，也能避免在前端應用中錯誤地暴露敏感資訊。

# References

[彻底理解 OAuth2 协议](https://www.youtube.com/watch?v=T0h6A-M_WmI)

[OAuth 2.0 and OpenID Connect (in plain English)](https://www.youtube.com/watch?v=996OiexHze0)