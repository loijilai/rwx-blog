---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Token 儲存策略|Token 儲存策略]]
>   - [[#Access Token 放在記憶體|Access Token 放在記憶體]]
>   - [[#Refresh Token 放在 HttpOnly Cookie|Refresh Token 放在 HttpOnly Cookie]]
> - [[#HttpOnly Cookie 帶來的連鎖調整|HttpOnly Cookie 帶來的連鎖調整]]
>   - [[#CORS|CORS]]
>   - [[#CSRF|CSRF]]
>   - [[#後端 Token View|後端 Token View]]
> - [[#localStorage、sessionStorage 與記憶體|localStorage、sessionStorage 與記憶體]]
>   - [[#sessionStorage 真正縮小的風險|sessionStorage 真正縮小的風險]]
>   - [[#三種方式的差異|三種方式的差異]]
> - [[#Frontend Deployment 的心智模型|Frontend Deployment 的心智模型]]
>   - [[#一次 Frontend Request Flow|一次 Frontend Request Flow]]
> - [[#Frontend Environment Variables|Frontend Environment Variables]]

# Token 儲存策略

這個設計把兩種 token 分開處理：

- Access token 放在記憶體，不寫入任何 storage。
- Refresh token 放在 HttpOnly Cookie。

兩種 token 的有效期限與影響範圍不同，因此不必使用相同的儲存方式。

## Access Token 放在記憶體

Access token 只存在目前頁面的 JavaScript runtime。重新整理頁面後就會消失，換來的是不在瀏覽器 storage 中留下持久紀錄。

這可以降低以下風險：

- 瀏覽器擴充套件可能掃描 `localStorage`。
- 惡意 script 在 token 寫入一段時間後才被注入，回頭惡意搜尋 storage。
- Token 跨分頁或跨 browser session 持續存在。

但記憶體不能防止正在發生的 XSS。如果惡意 script 已經在同一個 page context 和 JavaScript runtime 中執行，只要它能碰到保存 token 的作用域，仍可能讀取 access token。

因此，記憶體主要防的是事後、跨分頁與持久化的竊取，不是 XSS 發生當下的讀取。

## Refresh Token 放在 HttpOnly Cookie

Refresh token 代表較長期的帳號控制能力，因此放在 HttpOnly Cookie：

```text
HttpOnly Cookie
└─ JavaScript 無法透過 document.cookie 讀取
```

即使頁面被注入惡意 script，script 也不能直接讀出 refresh token。這可以縮小長期 token 被外洩的管道。

不過，Cookie 會由瀏覽器自動附加到符合條件的 request，因此會重新引入 CORS 與 CSRF 的問題。

# HttpOnly Cookie 帶來的連鎖調整

Token storage 不是純前端決策。當 refresh token 改放 Cookie，前端 request、CORS、CSRF 與後端 API 都必須一起調整。

## CORS

如果 frontend 和 backend 位於不同 origin，例如：

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
```

前端必須明確要求瀏覽器帶上 credentials：

```javascript
fetch(url, {
  credentials: "include",
})
```

後端則需要允許 credentialed requests：

```text
CORS_ALLOW_CREDENTIALS = True
```

同時，`CORS_ALLOWED_ORIGINS` 不能使用 `*`，而要列出允許的 frontend origins。

## CSRF

Refresh token 進入 Cookie 後，瀏覽器會在呼叫 refresh endpoint 時自動帶上它：

```text
POST /api/auth/token/refresh/
Cookie: refresh_token=...
```

這符合 CSRF 的基本攻擊條件：惡意網站可能誘導使用者對 refresh endpoint 發送 request，而瀏覽器自動附加 Cookie。

因此 refresh endpoint 需要重新加入 CSRF 防護，例如 double-submit token，或至少透過適當的 `SameSite` 設定限制 cross-site Cookie 傳送。

## 後端 Token View

Simple JWT 內建的 `TokenObtainPairView` 與 `TokenRefreshView` 預設會把 token 放在 JSON body 中。

如果要讓 refresh token 只存在 Cookie：

1. 自訂 obtain-token view。
2. 使用 `Set-Cookie` 寫入 refresh token。
3. 設定 `HttpOnly`、`Secure` 與 `SameSite`。
4. 不再把 refresh token 回傳於 JSON body。
5. 自訂 refresh view，改從 Cookie 讀取 refresh token。

因此，「refresh token 放 HttpOnly Cookie」並不是只修改 React storage，而是 frontend 和 backend 共同的 authentication protocol。

# `localStorage`、`sessionStorage` 與記憶體

除了 `localStorage`，另一個想法是存在`sessionStorage`。但是`sessionStorage` 沒有解決 XSS 本身。如果惡意 script 已經在同一個 tab、同一個 JavaScript context 中執行，它仍可以呼叫：

```javascript
sessionStorage.getItem("access_token")
```

這一點和 `localStorage` 沒有本質差異。XSS 防護仍要依靠 CSP (content security policy)、輸入輸出 escaping，以及避免不安全地使用 `dangerouslySetInnerHTML` 等機制。

## `sessionStorage` 真正縮小的風險

`sessionStorage` 縮小的是非 XSS 情境下的洩漏範圍和時間窗：

- **跨分頁**：`localStorage` 由同 origin 的分頁共用；`sessionStorage` 綁在單一分頁。
- **持久時間**：關閉分頁後，`sessionStorage` 會消失，不會跨 browser session 長期保留。
- **事後竊取**：Token 不會長期留在磁碟上，降低之後才出現的惡意程式掃描 storage 的機會。

## 三種方式的差異

| 儲存方式             | 重新整理後 | 跨分頁 | 關閉分頁後 | XSS 當下可讀取 |
| ---------------- | ----- | --- | ----- | --------- |
| 記憶體              | 消失    | 不共用 | 消失    | 可能        |
| `sessionStorage` | 保留    | 不共用 | 消失    | 可以        |
| `localStorage`   | 保留    | 共用  | 保留    | 可以        |

`sessionStorage` 可以作為簡化版本，但必須誠實描述它的保護範圍：它不是 XSS 防護，而是縮小非 XSS 洩漏面。較完整的設計仍是 refresh token 使用 HttpOnly Cookie，access token 只存在記憶體。

# Frontend Deployment 的心智模型

Backend deployment 的心智模型是打包一個持續運行的 process：

```text
Docker image
  ↓
部署到機器
  ↓
Gunicorn / Celery process 持續運行
  ↓
Health check
```

Frontend deployment 不同。執行 `npm run build` 後產生的 `dist/` 是靜態檔案：

```text
dist/
├─ index.html
├─ hashed JavaScript files
└─ hashed CSS files
```

這些檔案本身沒有長期 process、不需要 CPU，也不會像 backend process 一樣 crash。它們需要的是一個能透過 HTTP 將 bytes 傳給瀏覽器的服務，例如 CDN。

## 一次 Frontend Request Flow

當使用者輸入：

```text
https://app.loijilai.site/security
```

流程是：

```text
1. DNS 查詢 app.loijilai.site。
2. DNS 回覆 Vercel 的入口。
3. Browser 與 Vercel 建立 TCP / TLS connection。
4. Vercel CDN 接收 GET /security。
5. CDN 回傳 index.html。
6. Browser 下載 JavaScript 與 CSS。
7. React 在 browser 中啟動。
8. React Router 讀取 /security。
9. React 呼叫部署在 AWS 的 Django API。
```

`index.html` 主要是載入 application JavaScript 的空殼；真正的 DOM 由 React 在瀏覽器中建立。

# Frontend Environment Variables

Backend 通常在 runtime 讀取 environment variables；Vite frontend 的 environment variables 則在 build time 被寫入輸出檔案。

```text
Backend
└─ Process 啟動時讀取 runtime environment

Frontend
└─ npm run build 時，把值寫入 JavaScript bundle
```

因此，frontend environment variables 對使用者是公開的。任何人都能透過 browser DevTools 或下載 JavaScript bundle 查看它們。

結論是：

> 不要把 secret 放進任何 `VITE_` 開頭的 environment variable。
