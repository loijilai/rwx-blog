---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#JWT Authentication|JWT Authentication]]
>   - [[#Q: 為什麼要有 access token & refresh token?|Q: 為什麼要有 access token & refresh token?]]
>   - [[#Q: 為什麼 OAuth 完成後,我們要「發自己的 JWT」給前端,而不是直接把 Google 給的 token 丟給前端拿去打我們的 API?|Q: 為什麼 OAuth 完成後,我們要「發自己的 JWT」給前端,而不是直接把 Google 給的 token 丟給前端拿去打我們的 API?]]
>   - [[#Q: 一個原本用「帳密註冊」的 user,之後改用 Google 登入，要幫她做 account linking 嗎？|Q: 一個原本用「帳密註冊」的 user,之後改用 Google 登入，要幫她做 account linking 嗎？]]
>   - [[#Q: OAuth flow 基本問題|Q: OAuth flow 基本問題]]
>   - [[#Q: 為什麼oauth flow中server要存一個state？|Q: 為什麼oauth flow中server要存一個state？]]
>   - [[#Q: OIDC vs. OAuth 2.0|Q: OIDC vs. OAuth 2.0]]
>   - [[#Q: OAuth Grant type 是什麼?|Q: OAuth Grant type 是什麼?]]
>   - [[#Q: Machine to Machine 的 OAuth Grant Type 討論|Q: Machine to Machine 的 OAuth Grant Type 討論]]

# JWT Authentication

Cookie Jar 主要敵人
1. CSRF -> 用 CSRF token
2. XSS -> 用 Http Only cookie

JWT token (假設放在 local storage)
1. CSRF -> 天生免疫，因為沒有瀏覽器發送cookie的規則
2. XSS -> QQ，而且被偷還能用一陣子

Logout 怎麼做？
1. 純前端刪除 jwt token
2. 後端刪除 refresh token

## Q: 為什麼要有 access token & refresh token?
1. 高頻使用的命短，少用的壽命長
2. revocation：解決 jwt stateless 的最大痛點，無法即時的撤銷。因為 access token is self-contained 無法做 blacklist，而 refresh token 可以查 blacklist

## Q: 為什麼 OAuth 完成後,我們要「發自己的 JWT」給前端,而不是直接把 Google 給的 token 丟給前端拿去打我們的 API?

理由：權限、生命週期應該要回到我的系統
1. **Identity mapping**: 因為自己發的jwt才會有該專案的domain model (User) 的資訊，google 發的token是帶有google的domain model
2. **統一認證出口(uniform auth surface)**: 你的 API 應該只有**一種**驗證方式(你自己的 JWT)，如果前端拿 Google token 來打你的 API,你**每個 request** 都得回頭去跟 Google 驗證(呼叫 Google 的 tokeninfo 或驗 Google 的公鑰)——你的 API 就被**耦合到 Google、還多一次外部往返**。  
	發自己的 JWT → 你用自己的 secret 驗、stateless、不call 外部。密碼使用者和 Google 使用者在你 API 眼中**長得一模一樣**。
3. **Audience 不匹配(安全反模式)**: OAuth 的安全設計要求 access token 應限制給預定的 resource server；所以 Google access token 只應該用於存取 Google resource server的資源，我的 Django API 不是該 token 的 intended audience
## Q: 一個原本用「帳密註冊」的 user,之後改用 Google 登入，要幫她做 account linking 嗎？

以 UX 而言一定希望是同一個帳號 (account linking)，系統行為如下：

1. **local register**:username + email + password;**login**:username + password ✅
2. **google login**:拿 Google 的 `(sub, email, email_verified)` →
	1. 這個 sub 的 SocialIdentity 已存在
	      → 老朋友,直接發 JWT                          ✅ 無腦、無風險
	2. sub 沒見過、email 也沒對應的 user
	      → 全新的人:建 CustomUser + SocialIdentity → 發 JWT   ✅ 直觀
	3. sub 沒見過,但 email 已經有一個 local 帳號
	      → 「要不要自動把 Google 綁到那個既有帳號?」         ⚠️ 全部的風險都在這

但要注意 account pre-hijacking

> 假設攻擊者知道 Alice 的 email 是 `alice@gmail.com`,他在你的網站用這個 email + 自己的密碼**搶先註冊**。之後 Alice 用真正的 Google 帳號登入,你「因為 email 相同就自動 link」

解法：**email 只有在兩端都驗證過時,才能當 account linking 的 key;否則要嘛不綁、要嘛要求使用者先證明擁有既有帳號。**

這個知名漏洞會讓攻擊者預先建立好一個窩，如果自動account linking，就是幫使用者住進了攻擊者建立好的窩，所以使用者的資料都可以被攻擊者看到。

### 資料表設計：

「email 一等公民 + 未來可能多 provider」去設計,**最乾淨的做法其實就是上面這張兩層表**:`users`(你既有的,加 email)+ 新的 `identities`。你現有的帳密登入,就是 `provider = 'local'` 的一列。

`users` 只留「跨 provider 都成立」的事實，不應該放 password_hash 和 username，但是 django 把 username / password_hash 焊死在 users 了，所以這是一個妥協。

```
users        →  id, email, created_at         (「這個人是誰」,provider 無關)
identities   →  user_id, 
				provider, 
				provider_sub,
                username,            (只有 provider='local' username)
                password_hash,       (只有 provider='local' password_hash才有值)
                email_verified,
                
                email,
                created_at

```

疑問是email, created_at不是應該在user model嗎？socialidentity怎麼又存一份?

email 是指 google 的帳號，users 存的是當初註冊的 email，這在實作綁定功能時，兩者可能不同，所以要分開紀錄。而 created_at 存的是綁定的時間，不同於 users 存的 date_joined，有可能多年前註冊但今天才綁定。


## Q: OAuth flow 基本問題

![[auth-sequence-google-oidc.png]]

```
完整流程 (注意 Cookie 的使用)
Browser
   │
   │ GET /auth/google/login
   ▼
Your Backend
   │ 1. 產生 state
   │ 2. 產生 nonce
   │ 3. 產生 PKCE code_verifier / code_challenge
   │ 4. 將 state、nonce、code_verifier 存入 Django session
   │
   │ 302 Redirect
   │ Location: https://accounts.google.com/o/oauth2/v2/auth?...
   │ Set-Cookie: sessionid=...
   ▼
Browser
   │
   │ GET Google Authorization URL
   ▼
Google
   │ 使用者登入
   │ 使用者同意授權
   │
   │ 302 Redirect
   │ Location: https://your-api.com/auth/google/callback
   │           ?code=xxx
   │           &state=xxx
   ▼
Browser
   │ （注意有 state 跟 sessionid)
   │ GET /auth/google/callback?code=xxx&state=xxx
   │ Cookie: sessionid=...
   ▼
Your Backend
   │ 1. 用 sessionid 找到原本的 Django session
   │ 2. 比對 callback state 與 session state
   │ 3. Django 用 authorization code 換回：
   |   - id_token
   |   - Google access_token
   │ 4. 用 google-auth 驗證 id_token 
   |   - signature: Google 用自己的私鑰產生 `signature`, `google-auth` 使用 Google 公開的公鑰驗證
   |   - iss是google
   |   - token.aud == 我的 Google Client ID
   |   - exp, nonce
   │ 5. 從 id_token 取得 sub, email
   | 6. 找到本地 User
   │ 7. 發你自己的 access JWT / refresh JWT   
   ▼
Frontend
   │
   │ 使用你的 JWT 呼叫你的 API
   ▼
Your API
```

為什麼Browser去GET Google Authorization URL拿authorization code，而Backend去Google Token Endpoint把authorization code換成access token再傳給Browser

1. 為什麼要分authorization code & access token？為什麼不是Google直接傳access token給browser?
	1. 不要混淆 django api 的 access token 和 Google 的 access token，token exchange結束後拿到的是 google 的 access token，這沒有必要給 client app 前端
2. 就算分兩階段好了，為什麼google authorization url是browser打，而token endpoint是backend打？為什麼這樣設計？
	1. FE的職責是使用者登入與授權，需要UI，而登入應該是google密碼輸入google網站，client backend不應該取得使用者的google密碼
	2. BE能夠保存client_secret，token exchange由後端做

> Advanced Topic: PKCE, id_token, authn vs authz, id_token 如何換 email

## Q: 為什麼oauth flow中server要存一個state？
### `state` 要防的攻擊:Login CSRF(登入型跨站請求偽造)

先看**沒有 state** 會怎樣。你的 callback 長這樣:

```
GET /api/auth/google/callback?code=XXX
→ 拿 code 換 token → 登入發 code 對應的那個人
```

問題:**這個 callback 會無條件相信「任何送到它面前的 code」。** 攻擊來了:

1. 攻擊者用**自己的 Google 帳號**跑一次登入,拿到一個**合法的 `code`**(對應攻擊者帳號),但攔住瀏覽器，不讓 code 被自己的 callback 兌換掉，因為 authorization code 是一次性的、兌換後就失效、通常綁定 `client_id` 和 `redirect_uri`，因此攻擊者必須趁 code 尚未被兌換時，把它送到受害者瀏覽器
2. 攻擊者用釣魚連結 / 隱藏 img / 自動提交表單,**騙受害者的瀏覽器**去打: `your-site/api/auth/google/callback?code=攻擊者的code`
3. 你的 server 老實地換 token、登入 → **受害者的瀏覽器現在登入的是「攻擊者的帳號」**
4. 受害者不知情,以為是自己的帳號,上傳影片、填資料…… 全進了**攻擊者的帳號**,攻擊者事後登入自己帳號就看光光

核心弱點:**callback 無法分辨「這個 code 是不是我本人剛剛發起的那次登入帶回來的」。** 任何人塞 code 進來它都收。

### `state` 怎麼修:一張「只有我發得出、我認得的票根」

流程加三步:

1. **登入起點**(`/login`):產生一個**隨機、不可猜**的字串 `state`,一份**存進使用者的 session**(cookie 綁瀏覽器),另一份塞進導向 Google 的 URL
2. **Google** 原封不動把 `state` **echo 回來**到你的 callback:`callback?code=XXX&state=YYY`
3. **callback**:比對「回來的 `state`」跟「我 session 裡存的 `state`」。**不一致或缺少 → 直接拒絕**,連 code 都不換

**為什麼這樣就擋住了**:攻擊者偽造的那個 callback 請求,走的是**受害者的瀏覽器 / session**,但攻擊者**不知道**受害者 session 裡該有的 `state` 值(那是你為受害者這次 session 隨機發的、綁在他 cookie 上)。所以偽造請求帶的 state 對不上 → 驗證失敗 → 登入被擋。

一句話:**`state` 把「這次 callback」和「我本人剛剛發起的那次登入」綁在一起,讓 callback 能認出冒牌貨。**

## Q: OIDC vs. OAuth 2.0

|      | OAuth 2.0                             | OpenID Connect (OIDC)        |
| ---- | ------------------------------------- | ---------------------------- |
| 解決   | **authoriZation**:這個 app **能不能存取**某資源 | **authentiCation**:**這個人是誰** |
| 產物   | `access_token`(存取資源的鑰匙)               | `id_token`(身分證明,一個簽名 JWT)    |
| 標準內容 | **完全不規定**怎麼得知使用者身分                    | 規定了 `sub`/`email`… 這些身分宣告的格式 |

OIDC **不是取代 OAuth**,而是**疊在 OAuth 上面**加一層身分。

### 你專案裡最直接的證據:`scope="openid email"` 裡的 `openid`

你 /login 的 scope 有個 `openid` 關鍵字——**它就是「在 authorization 上開啟 authentication」的那個開關**:

- 如果 scope **拿掉 `openid`** → 你走的是**純 OAuth 2.0**:token endpoint 只回 `access_token`,**沒有 `id_token`**。你能代表使用者存取資源,但拿不到「他是誰」的標準身分證明。
- scope **加上 `openid`** → 你走的是 **OIDC**:Google 才會**多塞一個 `id_token`** 給你。

所以你 code 能拿到 `claims["sub"]` / `claims["email"]`,**唯一原因就是你 scope 寫了 `openid`**。你等於親手打開了「authentication 層」。

### 為什麼「OAuth 單獨做不了 authentication」?

「該把 authentication 的資訊放進 access token，還是放在一個平行的、獨立的 token 裡」

雖然說 access token 不一定要是 jwt，但先看一下我的 django api 發出來的格式：

```json
{
  "token_type": "access",
  "exp": 1785987765,
  "iat": 1785986865,
  "jti": "25826a0b7d52416abe741d1c1cf53c13",
  "user_id": "4"
}
```

再看一下 Google 發的 id_token：

```json
# 這是 id_token 拿去解碼，就可以拿到email了
{
  "iss": "https://accounts.google.com", # <-- 必須是google
  "azp": "377452737051-bog5pt1hj7aag1mi9bivrjtjs4r2r38l.apps.googleusercontent.com",
  "aud": "377452737051-bog5pt1hj7aag1mi9bivrjtjs4r2r38l.apps.googleusercontent.com", # <-- 必須是發給我
  "sub": "1xxxxx", # (google 穩定 id)
  "email": "xxx@gmail.com",
  "email_verified": true,
  "at_hash": "wc3Cwi-CpkAFFFzBsJkpvg",
  "iat": 1783411937,
  "exp": 1783415537 # <-- 必須還沒過期
}
```

### 一、access token 的收件人不是 client

這是最根本的一點。access token 對 client 而言是**「別人給我、要我轉交出去的憑證」**，client 在語意上是個信差，它不該去解析、更不該去「相信」這張票的內容。ID token 則是**「發給我本人的一份聲明」**。

一旦你要求 client 打開 access token 讀 `sub` 來決定「誰登入了」，你就把這兩個角色混在一起了。而混在一起會直接導致下面這個攻擊。

### 二、Token substitution attack

假設照你的設計：access token 裡有標準化的 `sub`、`email`，client 拿到後就認定「這個人登入了」。

攻擊流程：

1. 攻擊者自己也架一個 app（一個看起來無害的小工具），也去同一個 IdP 註冊。
2. 受害者 Alice 用同一個 IdP 登入攻擊者的 app（她自願的，這步完全合法）。
3. 攻擊者現在手上有一張 **Alice 的合法 access token**——由同一個 IdP 簽發、`sub` 就是 Alice、簽章完全正確、沒過期。
4. 攻擊者把這張 token 送到**你的** app 的登入端點。
5. 你的 app 驗簽 → 通過；讀 `sub` → Alice；於是把攻擊者以 Alice 的身分登入。

問題出在哪？**access token 沒有綁定「它是為誰而發的」**，至少在 bearer token 的模型下，持有即使用。它回答的是「可以做什麼」，不是「誰在對誰證明什麼」。

你當然可以說：那就在 access token 裡再加一個 `aud` / `client_id` 欄位，強制 client 檢查「這張票是不是發給我的」。**沒錯——但你這樣做的瞬間，你就把 access token 重新發明成 ID token 了**，而且還讓它同時扛兩種互相衝突的語意。

| 意圖                                          | 用什麼                    | 你的 app  |
| ------------------------------------------- | ---------------------- | ------- |
| **身分**：確認「這是誰」，拿來登入                         | OIDC 的 `id_token`      | ✅ 你只做這個 |
| **委派存取**：代表使用者去打 Google API（讀 Gmail、Drive…） | OAuth 的 `access_token` | ❌ 你沒用   |

你的 scope 只有 `openid email`，換回來的 `access_token` **你根本沒存、也沒拿去打任何 Google API**，只用了 `id_token` 認人。所以在「用途」這條軸上——**你是純粹把 Google 當身分提供者（login），沒有用到 OAuth 的委派存取能力**。

### 實例：Django Backend 和 Google Token Exchange 的結果是什麼？

如果 /login 有加 `access_type=offline` 且首次同意,還會多一個 `refresh_token`。你沒加,所以沒有。
```json
{
  "access_token": "ya29.a0Af...",      // authz: 拿去「存取 Google 資源」用的
  "expires_in": 3599,
  "scope": "openid https://www.googleapis.com/auth/userinfo.email",
  "token_type": "Bearer",
  "id_token": "eyJhbGciOiJSUzI1NiIs..." // authn: 一個 JWT,證明「使用者是誰」
}

```

Google 為什麼拆成 access token 和 ID token？

> ID token 回答的是 這個使用者是誰？Google 向你的應用程式證明，剛才完成登入的是 `sub=xxx` 這位使用者。所以 `id_token` 的接收者是**你的應用程式**。

## Q: OAuth Grant type 是什麼?

OAuth 2.0 的核心問題永遠是同一個：「**你怎麼證明自己有資格拿到 token？**」而 grant type 就是「**用什麼方式證明**」的不同流程。RFC 6749 + 後續 RFC 定義了一組並列的 grant type：

| Grant type                 | 怎麼證明資格                              | 適用場景                             |
| -------------------------- | ----------------------------------- | -------------------------------- |
| **Authorization Code**     | 真人在瀏覽器登入、同意，拿回一個一次性 `code` 再換 token | 有真人的 web/mobile 登入（你的 Google 登入） |
| **JWT-bearer / Assertion** | 遞一張可信第三方簽好的 JWT                     | 機器對機器（GitHub Actions→AWS）        |
| **Client Credentials**     | 用 client_id + client_secret         | 服務用「自己的身分」拿 token（沒有使用者）         |
| **Device Code**            | 在另一台裝置輸入 code                       | 電視、CLI 這種沒瀏覽器/鍵盤難打字的裝置           |
| ~~Password~~               | 直接給帳密                               | 已淘汰、不要用                          |

這些是**平行選項**——同一個 token endpoint，你在請求裡帶不同的 `grant_type` 參數，走不同的證明流程，最後都換到 token。

### 和 OIDC 的關係是什麼？

OIDC 那層不是 grant type——**它疊在任何 grant 之上**。你可以用 authorization code 拿 id_token（你的 Google 登入），也可以用 assertion 走 OIDC（GitHub→AWS）。所以正確的分層是：

```
OIDC（身分層，加 id_token）
     疊在 ↓
OAuth grant type（authorization code / assertion / client credentials / …）  ← 這層才是「流程」
```

一句收：**grant type 是「怎麼換 token」的並列流程，assertion 和 authorization code 是其中兩種、地位相同；差別在有沒有真人。OIDC 是另一條軸，疊在它們任何一個上面。**

## Q: Machine to Machine 的 OAuth Grant Type 討論

> Q: 機器對機器有Assertion和client credentials兩種，為什麼CD要用assertion而不是client credentials？我之前machine-to-machine存取google drive就是用client credential

Quick Answer: 之前用service account 存取 google drive 不是 client credential，這個才是 client credential (https://docs.dnb.com/partner/en-US/plus/token/1.0/authentication)
### client credentials 和 assertion 兩者的本質差異

|            | Client Credentials                         | Assertion (JWT-bearer / Web Identity)    |
| ---------- | ------------------------------------------ | ---------------------------------------- |
| 客戶端拿什麼證明自己 | 一把**共享密鑰**（client_secret / AWS access key） | 一把**簽章私鑰**，簽出短期 JWT                      |
| 這把密鑰要不要存   | **要**，長期有效，存在客戶端                           | 私鑰在**簽發方**（GitHub）手上，你拿不到也不用存            |
| 傳輸中的東西     | 那把長期密鑰本身                                   | 幾分鐘就過期的簽名 JWT                            |
| 帶不帶身分脈絡    | 不帶——「誰有密鑰誰就是我」                             | 帶——JWT 裡有 `repo`、`branch`、`sub` 等 claims |

### 為什麼 GitHub→AWS 選 assertion

如果這裡用 **client credentials**，意思就是：你得生一組 **AWS access key，存進 GitHub Secrets**。而這正是我們一開始就想幹掉的東西：

- 它**長期有效**——洩了誰撿到都能用，而且你不知道洩了沒。
- 它**沒有脈絡**——AWS 只看到「有人拿著正確的 key」，無法區分是 master、是某個 PR、還是被偷去的。你**沒辦法**寫「只准 master branch」這種條件。

用 **assertion** 剛好把這兩點都解掉：

1. **沒有長期密鑰要存**：簽章私鑰在 GitHub 手上（它自己保管、每次 rotate，你碰不到）。你這邊 GitHub Secrets 是**空的**。
2. **每次跑帶可驗證的身分**：JWT 裡寫著 `repo:loijilai/durable-queue:ref:refs/heads/master`，AWS 的 trust policy 可以 `StringLike` 鎖死它

所以選擇標準是：**當平台原生會簽發 OIDC token（GitHub Actions 就是）、而對方原生收 OIDC token（AWS STS 就是）時，走 assertion 拿到「零長期密鑰 + 帶身分脈絡」，沒有理由退回去存一把靜態 key。**

> 補充：client credentials 在這裡**技術上也能用**（存 AWS key 進 GitHub Secrets），那是 OIDC 出現前的「舊做法」，到今天還能跑。所以這是個**選擇題**，assertion 是有原生支援時的更好答案。

### 你的 Google Drive 那個 case——值得回頭看一眼

這裡有個容易被名字騙的點。如果你當時用的是 **Google service account + 下載一個 JSON key（裡面有 private key）**，那其實**底層就是 assertion（JWT-bearer, RFC 7523）**——你的程式用那把 private key 簽一張 JWT，拿去 Google 換 access token。Google 文件常籠統叫它「service account credentials」，很多人就記成「client credentials」，但機制上它是 assertion。

真正的 client credentials 是你直接拿 **client_id + client_secret** 去換 token、沒有簽 JWT 這一步。


