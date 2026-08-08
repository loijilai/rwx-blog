---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Certificate：Server 說自己是誰，為什麼我要相信？|Certificate：Server 說自己是誰，為什麼我要相信？]]
> - [[#為什麼還需要 Intermediate CA？|為什麼還需要 Intermediate CA？]]
> - [[#Browser 實際連線時怎麼驗證？|Browser 實際連線時怎麼驗證？]]
> - [[#api.example.com 怎麼拿到 Certificate？|api.example.com 怎麼拿到 Certificate？]]
> - [[#Certificate 還沒有解決所有問題|Certificate 還沒有解決所有問題]]
> - [[#TLS Handshake：建立真正的安全連線|TLS Handshake：建立真正的安全連線]]
>   - [[#ClientHello：Browser 先提出連線條件|ClientHello：Browser 先提出連線條件]]
>   - [[#ServerHello：Server 也提供自己的 ephemeral public key|ServerHello：Server 也提供自己的 ephemeral public key]]
>   - [[#但 ECDHE 本身無法證明你在跟誰交換 key|但 ECDHE 本身無法證明你在跟誰交換 key]]
>   - [[#CertificateVerify：證明 Server 真的有 Private Key|CertificateVerify：證明 Server 真的有 Private Key]]
>   - [[#Finished：確認雙方看到的是同一場 Handshake|Finished：確認雙方看到的是同一場 Handshake]]
> - [[#接下來才開始真正傳 HTTP|接下來才開始真正傳 HTTP]]
> - [[#Certificate Key 和 Session Key 是兩套不同的東西|Certificate Key 和 Session Key 是兩套不同的東西]]


理解 HTTPS，可以先拆成兩個核心問題：

1. **我怎麼知道我連到的真的是 `api.example.com`？**
2. **確認對方身分之後，雙方要怎麼建立一條安全的加密連線？**
    

第一個問題由 Certificate / PKI 解決，第二個問題則由 TLS Handshake 解決。

假設你第一次在 Browser 打開 `https://api.example.com`，我們從這個情境一路看下去。

---

## Certificate：Server 說自己是誰，為什麼我要相信？

當你連到 `api.example.com` 時，Server 當然可以直接告訴你：「我是 `api.example.com`，這是我的 public key。」

問題是，任何人都可以這樣說。

攻擊者也可以攔在中間，告訴你的 Browser：「我是 `api.example.com`，請使用我的 public key。」

因此，**Server 自己宣告自己的身分沒有任何可信度**。我們需要一個 Browser 原本就信任的第三方來替 Server 背書，這個角色就是 Certificate Authority，也就是 CA。

### Trust Store 是整條信任鏈的起點

Browser 或 OS 本身會預先內建一組可信任的 Root CA，例如 DigiCert、GlobalSign，以及其他通過各平台 Root Program 審核的 CA。

這些 Root CA 的 certificate 和 public key 會存在 Browser / OS 的 **Trust Store** 裡。

換句話說，Browser 一開始就有一個前提：「我信任這些 Root CA。」

這個信任並不是 TLS 連線時產生的，而是 Apple、Microsoft、Mozilla、Google 等平台事先建立並散布到裝置上的。

因此整條 certificate trust chain 的最上游，是這個預先存在的 trust store。

---

## 為什麼還需要 Intermediate CA？

實務上 Root CA 的 private key 極度重要。如果 Root private key 洩漏，整個信任體系都會受到巨大影響。

因此 Root CA 通常不會直接替全世界所有網站簽 certificate，而是先替 Intermediate CA 簽 certificate，再由 Intermediate CA 負責日常的憑證簽發。

## Browser 實際連線時怎麼驗證？

現在 Browser 真的開始連線到 `https://api.example.com`。

### 驗證 Server Certificate 和 Intermediate CA
Server 會把自己的 certificate 傳給 Browser，通常也會附上需要的 Intermediate CA certificates。

Browser 會先檢查 `api.example.com` 的 certificate 是不是真的由 Intermediate CA 簽署。

它從 Intermediate certificate 取得 Intermediate public key，用這把 public key 驗證 server certificate 的 signature。

驗證成功，只能證明：「這張 certificate 確實是 Intermediate CA 簽的。」

但 Browser 接下來還會問：「我為什麼要相信這個 Intermediate CA？」

### 驗證 Root CA 簽署
於是繼續往上驗證 Intermediate certificate。

Browser 發現它是由某個 Root CA 簽署，於是再使用 Root CA 的 public key 驗證 Intermediate certificate 的 signature。

如果驗證成功，而且這個 Root CA 剛好存在 Browser 的 Trust Store，整條 chain 就成立。

所以信任的推導其實非常單純：

```text
Browser 預先信任 Root CA
        ↓
Root CA 替 Intermediate CA 背書
        ↓
Intermediate CA 替 api.example.com 背書
        ↓
Browser 接受 api.example.com 的 public key
```

這就是所謂的 **Chain of Trust**。

---
## `api.example.com` 怎麼拿到 Certificate？

假設你是 `api.example.com` 的擁有者，現在去 Certificate Authority 申請 certificate。

CA 不會因為你說「這個 domain 是我的」就相信你。

它會先要求你證明自己確實控制 `api.example.com`。

例如使用 DNS challenge 時，CA 可能要求你在 `_acme-challenge.api.example.com` 放入指定的 TXT record。因為只有能控制該 domain DNS 的人才能完成這件事，所以 CA 可以藉此確認你確實控制這個 domain。

驗證成功之後，Intermediate CA 就可以替你的 certificate 簽章。

這張 certificate 大致在宣告：

`api.example.com` 對應的 public key 是 `SERVER-PUB`，而 Intermediate CA 已經替這個關係背書。

因此 certificate 最核心的功能，可以理解成：

> 某個受到 Browser 信任的 CA，確認這把 public key 可以代表 `api.example.com`。

---

# Certificate 還沒有解決所有問題

到這裡 Browser 已經知道：

「這張 certificate 裡的 public key 可以代表 `api.example.com`。」

但是這仍然留下另一個問題。

Certificate 本身是公開資訊，任何人都可以下載 `api.example.com` 的 certificate。

因此攻擊者完全可以把真正網站的 certificate 複製一份，再拿給 Browser 看。

所以 Browser 還需要確認一件事：

> 眼前這台 Server 不只是拿得到 certificate，而是真的持有這張 certificate 對應的 private key。

這就進入 TLS Handshake。

---

# TLS Handshake：建立真正的安全連線

Certificate 解決的是身分問題。

TLS Handshake 接著要完成兩件事：

- 證明眼前的 Server 真的持有 certificate 對應的 private key。
- Browser 和 Server 協商出只有彼此知道的 session keys。
    

以現在主流的 TLS 1.3 為例，可以先把整個 handshake 看成：

```text
Browser                               Server
  |                                     |
  | ---- ClientHello -----------------> |
  |                                     |
  | <--- ServerHello ------------------ |
  | <--- Certificate ------------------ |
  | <--- CertificateVerify ------------ |
  | <--- Finished --------------------- |
  |                                     |
  | ---- Finished --------------------> |
  |                                     |
  | ===== encrypted HTTP =============> |
```

---

## ClientHello：Browser 先提出連線條件

Browser 首先送出 `ClientHello`。

裡面會包含像是支援的 TLS 版本、cipher suites、要連線的 hostname，以及 key exchange 所需要的資訊。

其中很重要的一部分，是 Browser 會產生一組臨時的，也就是 **ephemeral**，public/private key pair。

可以把它簡化理解成：Browser 自己保留 `browser_secret`，然後把 `browser_public` 送給 Server。

Private key 永遠不會直接傳出去。

---

## ServerHello：Server 也提供自己的 ephemeral public key

Server 收到 ClientHello 後，會選定雙方要使用的 TLS 版本和 cipher suite，並回傳 `ServerHello`。

Server 同樣也會產生自己的 ephemeral key pair，自己保留 `server_secret`，把 `server_public` 傳給 Browser。

接著雙方利用 ECDHE，可以各自在本地計算出同一份 `shared secret`。

> 這邊最神奇的就是：`ECDHE(browser_secret + server_public) = ECDHE(browser_public + server_secret)`

最重要的是：

**shared secret 從來沒有直接在網路上傳輸。**旁觀者只看到兩個public key在傳輸。

旁邊的竊聽者即使看得到 `browser_public` 和 `server_public`，也無法因此計算出 shared secret。

---

## 但 ECDHE 本身無法證明你在跟誰交換 key

這裡有一個非常重要的問題。

假設攻擊者攔在中間，他也可以分別跟 Browser 和 Server 做 ECDHE。

因此光是成功建立 shared secret，並不能證明你真的在和 `api.example.com` 建立 shared secret。

這就是 Certificate 再次登場的地方。

Server 把 `api.example.com` 的 certificate 傳給 Browser，Browser 使用剛才介紹過的 certificate chain 去驗證它。

它會確認 domain 是否符合、certificate 是否有效，以及 chain 最後是否能連到 Trust Store 裡可信任的 Root CA。

如果這些都成功，Browser 現在知道 certificate 裡面的 `SERVER_CERT_PUBLIC_KEY` 確實可以代表 `api.example.com`。

但還需要最後一個證明。

---

## CertificateVerify：證明 Server 真的有 Private Key

Server 擁有 certificate 對應的 `SERVER_CERT_PRIVATE_KEY`。

在 TLS handshake 中，Server 會使用這把 private key 對目前的 handshake transcript 做數位簽章，並把結果放在 `CertificateVerify` message 裡。

Browser 收到之後，使用 certificate 裡的 `SERVER_CERT_PUBLIC_KEY` 驗證 signature。

如果驗證成功，就代表眼前這個 Server 真的持有對應的 private key。

因此這裡完成了兩層驗證：

第一層是 Certificate 告訴 Browser：「這把 public key 可以代表 `api.example.com`。」

第二層是 CertificateVerify 告訴 Browser：「眼前這台 Server 確實持有這把 public key 對應的 private key。」

兩個條件合起來，Browser 才能合理確認自己真的在和 `api.example.com` 建立連線。

---

## Finished：確認雙方看到的是同一場 Handshake

此時 Browser 和 Server 已經透過 ECDHE 建立 shared secret。

TLS 1.3 接著會利用 HKDF 從這些 secret material 推導出不同用途的 cryptographic keys，例如 handshake traffic keys，以及後續真正傳輸資料所使用的 application traffic keys。

Server 接著送出 `Finished` message。

它的作用可以粗略理解成：

> 我知道我們剛才建立出來的 secret，而且我看到的整段 handshake 內容和你看到的是一致的。

Browser 驗證成功後，也會回自己的 `Finished`。

到這裡，TLS Handshake 才正式完成。

---

# 接下來才開始真正傳 HTTP

Handshake 完成後，Browser 才開始送真正的 application data，例如 HTTP request。

像是 `GET /users`、Cookie、Authorization header、request body 等內容，在網路上都不再以 plaintext 傳輸，而是使用剛剛 handshake 產生的對稱式 traffic keys 加密。

整個流程可以濃縮成：

```text
Browser / Server
      ↓
ECDHE key exchange
      ↓
shared secret
      ↓
HKDF
      ↓
traffic keys
      ↓
encrypted HTTP
```

---

# Certificate Key 和 Session Key 是兩套不同的東西

這是理解現代 TLS 很重要的一個分界。

Certificate 有自己的 long-term key pair，也就是 certificate public key 和 certificate private key。

它的主要用途是 **authentication**：證明眼前的 Server 真的是 certificate 所代表的對象。

真正用來大量加密 HTTP 流量的，則不是 certificate private key。

Browser 和 Server 會利用 ephemeral ECDHE key exchange 建立 shared secret，再從 shared secret 推導出對稱式 traffic keys。

因此可以這樣記：

```text
Certificate key pair
        ↓
Authentication
「你真的是 api.example.com 嗎？」

ECDHE ephemeral keys
        ↓
Shared secret
        ↓
Session / Traffic keys
        ↓
Encryption
「我們接下來怎麼安全傳資料？」
```

HTTPS 的核心其實就是把這兩件事情接起來：

> **Certificate / PKI 負責建立身分信任；TLS Handshake 利用這個身分信任安全地完成 key exchange；最後使用對稱式 session keys 加密真正的 HTTP traffic。**

所以如果要用一句話理解 HTTPS：

**先確認「你是誰」，再建立「只有我們知道的秘密」，最後拿這個秘密安全地傳 HTTP。**
