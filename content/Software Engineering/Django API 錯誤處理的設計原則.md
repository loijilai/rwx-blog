---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#錯誤處理真正要回答的問題|錯誤處理真正要回答的問題]]
> - [[#只有會改變回應時才 Catch|只有會改變回應時才 Catch]]
> - [[#使用者能否自行恢復？|使用者能否自行恢復？]]
> - [[#OAuth Callback 案例|OAuth Callback 案例]]
>   - [[#invalid_grant|invalid_grant]]
>   - [[#invalid_client|invalid_client]]
>   - [[#Invalid JSON|Invalid JSON]]
>   - [[#Invalid ID Token|Invalid ID Token]]
>   - [[#Network Timeout|Network Timeout]]
> - [[#Decision Table|Decision Table]]
> - [[#設計原則|設計原則]]

# 錯誤處理真正要回答的問題

錯誤處理時，不應先問「可能發生哪些錯誤」。錯誤種類幾乎無限，無法完整列舉。

更有用的問題是：

> Application 對 client 負有哪幾種不同的回應責任？

重點不是追求沒有錯誤，而是向 client 提供有效的 signal。如果錯誤不應發生，或使用者無法自行處理，就保留 traceback，讓 Django 回傳 500 並記錄 log。

# 只有會改變回應時才 Catch

Django 對未處理的 exception，預設會回傳 500 並寫入 log。這本身就是免費的 catch-all。

因此：

- Catch 後只回傳 500，通常是在重複 framework 已經做的事。
- Catch 後只 log 再重新拋出，通常也只是增加噪音。
- 只有當 application 會做出不同於預設 500 的處理時，才值得 catch。

核心原則是：

> 只有當你會做出和預設 500 不同的事時，才 catch。

# 使用者能否自行恢復？

判斷一個 exception 是否值得轉成明確的 4xx，可以問：

> 使用者知道這個錯誤後，能否採取行動恢復？

如果可以，應提供明確的 client error；如果不行，通常應保留 server error，讓問題進入 logging 和 monitoring。

# OAuth Callback 案例

原本的 OAuth token exchange：

```python
token_resp = http_requests.post(
    GOOGLE_TOKEN_URL,
    ...,
    timeout=10,
)
token_resp.raise_for_status()
```

如果只呼叫 `raise_for_status()`，Google 回傳的 `400 invalid_grant` 最後可能成為不具體的 500。這會讓原本可以自行恢復的使用者，看不到正確的處理方式。

## `invalid_grant`

Authorization code 已過期或使用過。使用者可以重新走一次 login flow，因此值得轉成明確的 4xx response。

## `invalid_client`

Client ID 或 client secret 設定錯誤。這是 server configuration 問題，使用者無法修復，應保留 500。

## Invalid JSON

如果 Google 回傳無法解析的 response body，這不是使用者可以解決的問題，應保留 traceback 與 500。

## Invalid ID Token

ID token 驗證失敗，可能代表攻擊或 server configuration 錯誤，不應被包裝成一般 client input error。

## Network Timeout

無法連線到 Google 或 request timeout，使用者通常無法透過修改輸入立即修復，因此交給 server error handling。

# Decision Table

| 可能的錯誤 | 使用者能自行修復？ | 處理方式 |
|---|---:|---|
| `invalid_grant` | 可以，重新登入 | 回傳明確 4xx |
| `invalid_client` | 不行，server config 錯誤 | 保留 500 |
| JSON parse error | 不行，provider response 異常 | 保留 500 |
| ID token verification failure | 不行，可能是攻擊或設定錯誤 | 保留 500 |
| Google connection timeout | 不行 | 保留 500 |

# 設計原則

錯誤分類的目的不是把所有 exception 都轉成漂亮訊息，而是區分：

```text
使用者能修復
→ 提供明確的 4xx 與 recovery signal

使用者無法修復
→ 保留 500、traceback 與 operational signal
```

沒有必要 catch 的錯誤，應交給 framework 的預設行為，避免把真正需要維運處理的問題默默吞掉。
