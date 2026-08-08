---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Security Boundaries|Security Boundaries]]
> - [[#Threats Defended|Threats Defended]]
>   - [[#IDOR|IDOR]]
>   - [[#OAuth Login CSRF and Replay|OAuth Login CSRF and Replay]]
>   - [[#Credentials Exposed from Repository|Credentials Exposed from Repository]]
>   - [[#Direct Exposure of Data Stores|Direct Exposure of Data Stores]]
>   - [[#Long-lived Cloud Credentials|Long-lived Cloud Credentials]]
>   - [[#CI Pipeline Privilege Escalation|CI Pipeline Privilege Escalation]]
>   - [[#Eavesdropping in Transit|Eavesdropping in Transit]]
> - [[#Known Limitations|Known Limitations]]
>   - [[#VPC Internal Traffic Is Plaintext|VPC Internal Traffic Is Plaintext]]
>   - [[#No WAF|No WAF]]
>   - [[#No API Rate Limiting|No API Rate Limiting]]
>   - [[#JWT Cannot Be Revoked|JWT Cannot Be Revoked]]
>   - [[#No Automated Secret Rotation|No Automated Secret Rotation]]
>   - [[#No Network-flow Monitoring|No Network-flow Monitoring]]
> - [[#Current Security Posture|Current Security Posture]]

# Security Boundaries

Durable Queue 的安全設計分布在 application authorization、OAuth、AWS identity、network isolation 與 transport encryption。這份文件記錄目前已防禦的威脅，以及刻意沒有納入專案範圍的能力。

# Threats Defended

## IDOR

風險：使用者讀取其他使用者的 jobs。

目前防護：透過 per-user `get_queryset()` 限制可以查詢的 records。

## OAuth Login CSRF and Replay

風險：攻擊者替使用者綁定錯誤身份，或重複使用 login response。

目前防護：使用 one-time state，並驗證 ID token。

## Credentials Exposed from Repository

風險：Database password、Django `SECRET_KEY` 或 OAuth credentials 被 commit。

目前防護：Secrets Manager 保存 secret，EC2 透過 Instance Profile 取得短期 credentials 後讀取。

## Direct Exposure of Data Stores

風險：RDS 或 Redis 直接暴露到 public Internet。

目前防護：Data stores 不使用 public CIDR ingress，只允許來自 application Security Groups 的連線。

## Long-lived Cloud Credentials

風險：CI 保存長期 AWS access key，外洩後持續有效。

目前防護：GitHub Actions 使用 OIDC AssumeRole，取得短期 AWS credentials，不保存 static key。

## CI Pipeline Privilege Escalation

風險：Deployment workflow 任意把高權限 role 傳給其他 AWS services。

目前防護：`PassRole` 限制到指定 ARN 與 service。

## Eavesdropping in Transit

風險：Client 和 public application entry 之間的流量被竊聽。

目前防護：ALB 使用 ACM certificate，在 public boundary 提供 TLS。

# Known Limitations

## VPC Internal Traffic Is Plaintext

ALB 到 application，以及 application 到 Redis 的 internal traffic 沒有 TLS。

## No WAF

ALB 前沒有 WAF，因此未使用 managed rule sets 防禦常見 web attacks。

## No API Rate Limiting

目前沒有接上 DRF throttling，API 不具備完整的 rate limit 或 per-client quota。

## JWT Cannot Be Revoked

Simple JWT blacklist app 未啟用。Logout 後無法立即撤銷已簽發 token，只能等待約 15 分鐘的 access token expiry。

## No Automated Secret Rotation

Django `SECRET_KEY` 與 Google client secret 沒有自動 rotation。

## No Network-flow Monitoring

目前沒有啟用 GuardDuty 或 VPC Flow Logs，因此缺少 network-flow level 的監控與偵測。

# Current Security Posture

目前已處理：

- Authentication flow 中的 state 與 token verification。
- Application resource ownership。
- Repository credential leakage。
- Public data-store exposure。
- Long-lived AWS credentials。
- CI role escalation boundary。
- Public traffic TLS。

尚未處理：

- Internal TLS。
- WAF。
- API throttling。
- JWT revocation。
- Automated secret rotation。
- Network-flow monitoring。

這些限制不是已完成的 production security guarantee，而是目前專案刻意保留的範圍邊界。
