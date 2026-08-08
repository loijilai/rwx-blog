---
publish: true
tags:
date:
comments: true
---
這篇是我在做 `durable-queue` 專案時整理的 Python backend 學習筆記。

`durable-queue` 的目標是做一個能接收 YouTube URL、在背景非同步轉錄影片的工作佇列系統。這個專案的重點是理解一個後端系統要如何處理長時間任務、並發、重試、worker crash，以及跨系統狀態不一致的問題。

# Distributed Job Processing and Reliability

[[DRF 基本觀念]]

[[Transaction 與 Row Lock 處理 Race Condition]]

[[Celery 基本設定、Celery Concurrency]]

[[Python thread 有用嗎？]]

[[Celery Redelivery 與 At-least-once Processing]]

[[Django API 錯誤處理的設計原則]]

[[資料庫：SQlite to Postgresql]]

# Authentication and Client Security

[[Api Authentication & Authorization 基本觀念]]

[[Api Authentication & Authorization 實作紀錄]]

[[Frontend Token 儲存與靜態部署]]

# Containerization and Delivery

[[Dockerfile 與 Docker Compose 理解應用程式容器化]]

[[Continuous Integration and Delivery 基本觀念]]

[[Continuous Integration and Delivery 實作紀錄]]

# AWS System Architecture

- [[Request Flow and Application Runtime (Gunicorn, Reverse Proxy, Django Allowed Host)]]
- [[AWS Networking for Durable Queue (Region、AZ、VPC、Subnet、SG）]]
- [[Compute, ASG, and EC2]]
- [[Stateful Services and High Availability]]
- [[IAM, Secrets, and Runtime Configuration]]
- [[DNS, Route 53, TLS, and ACM]]
- [[Terraform State and Infrastructure Lifecycle]]
- [[從 Certificate 到 TLS Handshake：HTTPS 如何建立信任與加密連線]]

# Security

[[Durable Queue Security Model and Known Limitations]]

目前已保護 authentication、resource ownership、cloud credentials、network exposure 與 public TLS；尚未處理 WAF、API throttling、JWT revocation、internal TLS、secret rotation 和 network-flow monitoring。
