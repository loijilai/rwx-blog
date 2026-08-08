---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#DNS 是什麼？|DNS 是什麼？]]
>   - [[#名稱階層|名稱階層]]
>   - [[#DNS Zone|DNS Zone]]
>   - [[#Zone Apex、NS 與 SOA|Zone Apex、NS 與 SOA]]
>   - [[#A、CNAME 與 Route 53 Alias|A、CNAME 與 Route 53 Alias]]
> - [[#一次 DNS Query 如何發生|一次 DNS Query 如何發生]]
>   - [[#DNS 不是 HTTP Redirect|DNS 不是 HTTP Redirect]]
> - [[#CA 如何驗證 Domain Control|CA 如何驗證 Domain Control]]
>   - [[#ACM DNS Validation|ACM DNS Validation]]
> - [[#Subdomain Delegation|Subdomain Delegation]]
> - [[#ACM 與 Terraform 的非同步流程|ACM 與 Terraform 的非同步流程]]
> - [[#完整 Public Entry Flow|完整 Public Entry Flow]]


這篇整理使用者輸入 `durable-queue.loijilai.site` 後，DNS 如何找到 ALB，以及 ACM 如何證明該入口的 TLS identity。

# DNS 是什麼？

DNS 是階層式、分散式的名稱查詢系統，把人使用的名稱轉成網路需要的資料。

```text
api.example.com → 203.0.113.10
```

## 名稱階層

```text
.                  Root
└─ com              TLD
   └─ example        Domain
      └─ api         Subdomain / Hostname
```

完整名稱可以寫成：

```text
api.example.com.
               ↑ DNS root
```

平常最後的 `.` 會被省略。

## DNS Zone

Zone 是由一組 authoritative DNS servers 實際管理的名稱範圍。

```text
Zone: example.com
├─ example.com
├─ www.example.com
├─ api.example.com
└─ mail.example.com
```

子網域可以再被委派成另一個 zone：

```text
Zone: example.com
└─ shop.example.com → delegate

Zone: shop.example.com
└─ 由另一組 authoritative DNS servers 管理
```

之前會搞混 Zone 跟 Domain，但事實是不是很重要，zone = 管理邊界，domain = 名稱。最實用的記法：

- **Domain**：DNS 名稱，例如 `example.com`、`api.example.com`
- **Zone**：某組 authoritative DNS server 負責管理的範圍

## Zone Apex、NS 與 SOA

Zone apex 是該 zone 最頂端的名稱。**「某個名稱是不是 zone apex」取決於你有沒有真的為它建立一個 DNS zone。**

- `com.` 本身就是一個 zone，所以 `com.` zone 的 apex 就是 **`com.`**
- `example.com.` 如果有自己的 zone，那 apex 就是 **`example.com.`**
- `api.example.com.` 如果你另外建立並 delegation 一個 `api.example.com.` zone，那它的 apex 就是 **`api.example.com.`**

所以：

```
.                       ← root zone apex
└─ com.                  ← com. zone apex
   └─ example.com.       ← example.com. zone apex
      └─ api.example.com.← 只有建立獨立 zone 時，才是 zone apex
```

如果 `api.example.com` 只是 `example.com` zone 裡的一筆 `A/CNAME` record，那它只是 hostname/subdomain，**不是 zone apex**。

> **Zone apex = 該 DNS zone 本身的名稱，不是「所有 domain name 都天然有自己的 apex」。**


每個 zone apex 需要知道：

```text
NS Record
└─ 哪些 authoritative DNS servers 有資格回答？

SOA Record (Start of Authority)
└─ 這個 zone 的管理、版本與更新資訊是什麼？
```

SOA 通常包含 primary name server、serial number、refresh、retry、expire 與 negative TTL。

## A、CNAME 與 Route 53 Alias

### A Record

```text
api.example.com → IPv4 address
```

### CNAME

```text
www.example.com → app.vendor.com
```

CNAME 的語意是某個名稱完全是另一個名稱的 alias。具有 CNAME 的名稱不能同時保存其他 record data。這個規則的原因是：CNAME 的語意是「這個名稱完全只是另一個名稱的別名」，若同時又有 A record，就會矛盾，要用自己的 A record？還是跟著 CNAME 去查詢目標？

> 為什麼 Zone Apex 不能設定 CNAME ?

apex 無法設 CNAME：

```
example.com 必須有 NS + SOA
example.com 若設 CNAME，又要求不能有其他 record
→ 規則衝突
```

### Route 53 Alias

Route 53 Alias 是 AWS 功能，不是標準 DNS record type。它可以讓 zone apex 指向 ALB：

```text
durable-queue.loijilai.site
  ↓ Route 53 Alias A
ALB DNS name
  ↓
ALB current IPs
```

ALB 沒有適合 hardcode 的固定 IP，因此不能使用普通 A record；zone apex 又不能使用 CNAME，所以使用 Alias A record。

# 一次 DNS Query 如何發生

假設 client 查詢 `api.example.com`：

```text
Browser / OS Stub Resolver
  ↓
Recursive Resolver
  ↓ 問 root
Root DNS Server
  ↓ 回覆 .com TLD servers
.com TLD DNS Server
  ↓ 回覆 example.com authoritative servers
example.com Authoritative DNS Server
  ↓ 回覆 api.example.com 的資料
Recursive Resolver
  ↓ cache
Client
```

Root 和 TLD server 不直接保存每個 application IP，而是逐層指出下一個有 authority 的 DNS server。

## DNS 不是 HTTP Redirect

DNS 查詢發生在 HTTP 之前：

```text
1. DNS
2. TCP
3. TLS
4. HTTP
5. Server 才可能回 HTTP 302
```

|                          | DNS CNAME    | HTTP 302         |
| ------------------------ | ------------ | ---------------- |
| Protocol                 | DNS          | HTTP             |
| 發生時間                     | 連到網站前        | HTTP request 後   |
| 回覆者                      | DNS server   | Web server / ALB |
| 回傳                       | 另一個 DNS name | 新 URL            |
| 是否需要先建立網站 TCP connection | 否            | 是                |

DNS server 回傳 DNS response，不是 HTTP response。


# CA 如何驗證 Domain Control

CA 會產生只有 domain controller 能完成的 challenge。常見方式包括：

- DNS challenge：要求建立指定 TXT 或 CNAME record。
- HTTP challenge：要求網站在指定 path 提供 token。
- Email validation：寄信到 domain 管理地址。

這類公開 certificate 的重點通常是證明申請者控制該 domain，不一定驗證真實公司身份。

## ACM DNS Validation

ACM 的原理仍是公開 DNS ownership challenge。

```text
向 ACM 申請 certificate
  ↓
ACM 產生 validation CNAME
  ↓
把 CNAME 加進 public DNS
  ↓
ACM 查到 CNAME
  ↓
Certificate: ISSUED
```

Validation record 可以長期保留。只要 certificate 仍綁定支援的 AWS service，且 validation record 存在，ACM 就能管理續期。

# Subdomain Delegation

Namecheap 在這個架構中保留 registrar 和 parent DNS provider 的角色；`durable-queue.loijilai.site` 這段 namespace 則委派給 Route 53。

```text
Namecheap DNS：loijilai.site
├─ www.loijilai.site
├─ 其他既有 records
└─ durable-queue.loijilai.site NS → Route 53

Route 53 Hosted Zone：durable-queue.loijilai.site
├─ NS / SOA
├─ ACM validation CNAME
├─ Alias A → ALB
└─ 更深的 subdomains
```

步驟是：

1. 在 Route 53 建立 `durable-queue.loijilai.site` hosted zone。
	```
	意思是：準備一組 authoritative DNS servers，專門保存並回答這段名稱空間的紀錄。

	Route 53 自動產生：
		durable-queue.loijilai.site NS
		durable-queue.loijilai.site SOA
	```
2. 取得 Route 53 建立的 authoritative name servers。
3. 在 Namecheap parent zone 建立該 subdomain 的 NS records。

這讓 parent domain 繼續由 Namecheap 管理，而 Durable Queue 的 DNS lifecycle 可以交給 Terraform 與 Route 53。

# ACM 與 Terraform 的非同步流程

```text
aws_acm_certificate
  ↓ 產生 domain_validation_options
aws_route53_record
  ↓ 公開回答 DNS challenge
ACM 驗證
  ↓ PENDING_VALIDATION → ISSUED
aws_acm_certificate_validation
  ↓ 等待 certificate 可用
aws_lb_listener :443
```

三個 Terraform resources 的責任：

| Resource                              | Responsibility                      |
| ------------------------------------- | ----------------------------------- |
| `aws_acm_certificate`                 | 建立 certificate request，產生 challenge |
| `aws_route53_record`                  | 將 challenge response 寫入 DNS         |
| `aws_acm_certificate_validation`(假資源) | 等待 ACM 宣告 certificate 已可使用          |

一句話記住：

> Certificate resource 產生挑戰，DNS record 回答挑戰，validation resource 等待裁判宣布通過。

# 完整 Public Entry Flow

```text
Client 查 durable-queue.loijilai.site
  ↓
Parent zone 將 subdomain delegation 給 Route 53
  ↓
Route 53 Alias 回覆 ALB 對應的 IP
  ↓
Client 建立 TCP / TLS connection
  ↓
ALB 使用 ACM certificate 證明 domain identity
  ↓
ALB 將 HTTP request 送往 healthy API target
```

整條路徑的責任是：DNS 找到入口，TLS 證明入口身份，ALB 才開始處理 HTTP request。
