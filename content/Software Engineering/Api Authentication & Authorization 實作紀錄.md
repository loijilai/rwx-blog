---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Django TokenAuthentication|Django TokenAuthentication]]
> - [[#Django JWT Authentication 實作|Django JWT Authentication 實作]]
>   - [[#Q: simplejwt 做了什麼？|Q: simplejwt 做了什麼？]]
>   - [[#Q: 設定這行背後發生了什麼事情？|Q: 設定這行背後發生了什麼事情？]]
>   - [[#Q: 如何接上 Google Oauth 2.0|Q: 如何接上 Google Oauth 2.0]]

# Django TokenAuthentication

這個名字很容易誤解，這應該是session-based的一種，只是把 SessionAuthentication 的cookie改到http header手動帶上。

這是因為在 mobile app 或是 machine-to-machine 的情況下比較方便，不用依賴瀏覽器「Request 帶上 cookie」的機制。

因為不是 cookie，所以天生對CSRF免疫，但跟SessionAuthentication一樣會怕XSS，只是cookie還能設定http-only去擋XSS，所以最大的敵人可以說是XSS。

# Django JWT Authentication 實作
## Q: simplejwt 做了什麼？
1. 一組現成的 `/token/` `/token/refresh/` view
2. 一個 `JWTAuthentication` class 讓 DRF 每個 request 驗 `Authorization: Bearer` header
3. `AccessToken`/`RefreshToken` 物件讓你之後 Google OAuth 完成時「自己發 JWT」也用得到

## Q: 設定這行背後發生了什麼事情？
```
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
}
```
> 告訴 DRF：每個 APIView 處理 request 時，authentication 階段要使用哪些 class

1. Django 啟動時載入 `settings.py`
	DRF 讀到字串：
	```python
	"rest_framework_simplejwt.authentication.JWTAuthentication"
	```
	接著動態 import，大致可想成：
	```python
	from rest_framework_simplejwt.authentication import JWTAuthentication
	```
2. 每個 DRF View 取得預設設定
	`APIView` 本身大致有這種概念：
	```python
	class APIView:
	    authentication_classes = api_settings.DEFAULT_AUTHENTICATION_CLASSES
	```
	所以你寫：
	```python
	class ProfileView(APIView):    
		...
	```
	即使沒有指定 `authentication_classes`，它仍會繼承全域設定：

	```
	authentication_classes = [JWTAuthentication]
	```
3. Request 進入 DRF 時建立驗證器
	DRF 看到這個 View 要使用 `JWTAuthentication`，所以先建立一個 `JWTAuthentication` 物件，之後再叫它檢查 request

	```python
	# 不是啟動時全域只建立一次，而是處理 DRF request 時，`APIView` 都會建立一次，接著把這些物件交給 DRF 的 `Request`
	authenticators = [
	    authentication_class()
	    for authentication_class in self.authentication_classes
	]
	
	request = Request(  
		original_django_request,  
		authenticators=authenticators,  
	)
	
	```

	之後當 DRF 要取得：
	```
	request.user
	```
	它就逐一呼叫：
	```
	JWTAuthentication().authenticate(request)
	```

	完整的心智圖：

	```
	settings.py
	REST_FRAMEWORK
	    │
	    └─ DEFAULT_AUTHENTICATION_CLASSES
	             │
	             └─ JWTAuthentication class
	                        │
	HTTP Request            │
	    ↓                   │
	Django Middleware       │
	    ↓                   │
	URL Router              │
	    ↓                   │
	APIView.dispatch()      │
	    ↓                   │
	建立 DRF Request        │
	    ↓                   │
	建立 JWTAuthentication()
	    ↓
	authenticate(request)
	    ↓
	解析 Authorization: Bearer ...
	    ↓
	設定 request.user / request.auth
	    ↓
	執行 permission_classes
	    ↓
	執行 view 的 get() / post()
	```

### Q: `TokenObtainPairView` 底層怎麼驗 username & password

「登入怎麼驗證」直接決定「註冊怎麼建立使用者」

```
TokenObtainPairView
  → TokenObtainPairSerializer.validate()
    → authenticate(username=..., password=...)   ← Django 內建
      → ModelBackend.authenticate()
        → user.check_password(raw_password)        ← 關鍵在這
        
		1. 從 DB 撈出這個 user 的 `password` 欄位，是一段 hash。Django 預設存的長這樣:`pbkdf2_sha256$600000$<salt>$<hash>`(演算法$疊代次數$鹽$雜湊值)。
		2. 把使用者這次送來的**明文**,用**同樣的演算法 + 同一個 salt** 重算一次 hash。
		3. 比對兩個 hash 相不相等。相等 → 密碼正確。
```

Register endpoint 的重點：
1. 覆寫 serializer 的 `create()` 用 `create_user` 或是 `set_password`
2. `password` write_only，因為不該回傳
3. view **`AllowAny` 開洞**，因為註冊 endpoint 不應該擋權限
4. 密碼強度驗證，DRF 的 `BaseSerializer` 類別中有一段邏輯，會掃描物件中所有以 **`validate_<field_name>`** 開頭的方法，要在`validate_password`裡面呼叫 Django 內建的驗證函式
5. 重複 username已經免費被處理了，是因為 Django `User.username` 欄位本身有 `unique=True`,而 `ModelSerializer` 會**自動**幫這種欄位生一個 `UniqueValidator`

## Q: 如何接上 Google Oauth 2.0

### Django Server Session 

這行程式碼
```python
request.session["oauth_state"] = state
```

效果是：
1. 把 `oauth_state` 寫進目前這個使用者的 Django session。
2. Django 在 response 結束時保存 session 資料在資料庫中。
3. 瀏覽器收到或沿用一個 `sessionid` cookie。(「寫資料進 DB + 發 sessionid 給你」都是 SessionMiddleware 在**回應階段**幫你做的)
4. 下次 callback 時，瀏覽器帶回 `sessionid`。
5. Django 根據 `sessionid` 找回：
```python
request.session["oauth_state"]
```

預設資料庫型 session 下 (存在 django_session)，概念上是：
```text
瀏覽器 cookie:
sessionid=abc123

Server session storage:
abc123 → {"oauth_state": "random-state"}
```
所以 `state` 通常存在 server 的 DB／Redis；cookie 裡主要只是 session ID，不是直接塞完整 `state`。

### Django Server Session 會導致無法擴展，有其他想法嗎？

OAuth 2.0(RFC 6749 §10.12,以及後來的 Security BCP RFC 9700)**要求**你帶 `state` 來防 callback 的 CSRF——這是標準。但標準**只規定 state 要不可猜測、且能綁回發起這次流程的使用者**,**沒規定你要存在哪**。

> 核心想法:**把「證明這是我發出的」這件事,從「查 server 端記錄」換成「驗簽章」。**

1. 可以把 HMAC 想成會吃 secret 的 hash，其實 HMAC 不陌生，因為 JWT 就是格式標準化的 payload + HMAC 簽章
	```
	signature = HMAC(secret, message)
	```

	HMAC 不是加密
	```
	HMAC 提供： ✓ 完整性 integrity ✓ 真實性 authenticity 
	
	HMAC 不提供： ✗ 機密性 confidentiality
	```
2. **nonce**：一次性的隨機識別碼，用來表示「這一次請求」

流程：

發起時(login):

1. 組一個 payload:一段隨機 nonce +（通常）一個過期時間戳。
	```python
	payload = {
	  "nonce": "x4ToYF3n7K8q",
	  "exp": 1784523600
	}
	```
2. 用 server 的 secret 對它**簽章**(HMAC,或直接做成短效期 JWT),`state = payload + 簽章`。
	```python
	signature = HMAC(server_secret, payload)
	
	state = base64(payload) + "." + base64(signature)
	```
1. 塞進 redirect URL 給 Google, **server 什麼都不存**。

回來時(callback):

1. 拿到 `state`,用同一把 secret **驗簽章** + 檢查沒過期。
	```
	state = payload.signature
	
	1. 拆出 payload 
	2. 使用相同 secret 重新計算 HMAC
	3. 比較兩個 signature 
	4. 檢查 exp 是否過期
	```
2. 簽章對 → 這一定是我剛才簽發的、還沒過期 → 信任。

漏洞：可以信任這份 payload 確實由 server 簽發且沒有被修改，但不一定能證明是目前這個瀏覽器的這一次登入流程。

要證明是同一個瀏覽器，會透過 double-submit，也就是綁定瀏覽器 Cookie。

但還是無法擋掉 replay attack，但在 OAuth 裡要注意：**authorization code 通常本身就是一次性的**，第一次兌換後，第二次通常會失敗。所以單純重播同一組 `code + state`，威脅常常有限。
