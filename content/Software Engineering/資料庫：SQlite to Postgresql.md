---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#SQLite database is locked|SQLite database is locked]]
> - [[#連線到 PostgreSQL|連線到 PostgreSQL]]
> - [[#PostgreSQL 權限基礎觀念|PostgreSQL 權限基礎觀念]]
>   - [[#一、整體心智圖|一、整體心智圖]]
>   - [[#二、Role 是 PostgreSQL 權限系統的核心|二、Role 是 PostgreSQL 權限系統的核心]]
>   - [[#三、Role 屬性與物件權限是兩回事|三、Role 屬性與物件權限是兩回事]]
>   - [[#四、查詢資料時需要通過多層權限|四、查詢資料時需要通過多層權限]]
> - [[#以一個典型全端專案來說|以一個典型全端專案來說]]

# SQLite database is locked

開發早期使用 SQLite 時，曾遇到 `database is locked`。原因是 SQLite 的並發寫入能力和 PostgreSQL 不同；它不是以 row-level lock 為主的資料庫。

一個典型情境是：

```text
T1: BEGIN
T1: SELECT        # T1 持有讀鎖

T2: BEGIN
T2: SELECT        # T2 也持有讀鎖

T1: UPDATE        # T1 想升級成寫鎖
T2: UPDATE        # T2 也想升級成寫鎖
```

SQLite 同時間只能有一個 writer。當多個 transaction 同時讀取後又想升級成寫入，就容易互相卡住，最後出現 `database is locked`。

這也是為什麼 durable queue 這類需要並發控制的系統，最後應該切到 PostgreSQL。PostgreSQL 支援 row-level lock、`SELECT ... FOR UPDATE` 與 `SKIP LOCKED`，比較適合實作 queue claiming 與多 worker 並發。


# 連線到 PostgreSQL

連線到 PostgreSQL 時，需要先理解幾個元素：

- `host:port`：PostgreSQL server 在哪裡。
- database name：要連到哪個 database。
- database user：用哪個 DB 使用者連線。
- password：這個 DB 使用者的密碼。
- engine：Django 使用哪個 database backend。
- driver：Python 透過哪個套件與 PostgreSQL 溝通，例如 `psycopg`。

engine 與 driver 的關係可以這樣理解：

```text
你的 Django 程式
    |
    v
ENGINE：懂 Django ORM，也懂 PostgreSQL SQL 方言
    |
    v
Driver：負責建立 TCP connection、送出 SQL、接收查詢結果
    |
    v
PostgreSQL Server
```

底層流程大致是：

1. Django ORM 建立查詢需求。
2. PostgreSQL engine 產生 PostgreSQL SQL。
3. Engine 呼叫 `psycopg` driver。
4. `psycopg` 建立或重用 connection。
5. `psycopg` 把 SQL 傳給 PostgreSQL。
6. PostgreSQL 回傳資料。
7. `psycopg` 把結果交回 Django engine。
8. Django 把資料轉成 model object。

如果用 Docker 跑 PostgreSQL，可以透過環境變數建立預設 database 與 user：

```bash
docker run \
  --name my-postgres \
  -e POSTGRES_USER=django_user \
  -e POSTGRES_PASSWORD=django_password \
  -e POSTGRES_DB=django_db \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  -d postgres
```

對應到 Django settings：

```python
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["POSTGRES_DB"],
        "USER": os.environ["POSTGRES_USER"],
        "PASSWORD": os.environ["POSTGRES_PASSWORD"],
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}
```

# PostgreSQL 權限基礎觀念

PostgreSQL 權限可以用一句話理解：

> 誰（Role）以什麼身份，對哪個物件（Object），能做什麼操作（Privilege），而且是否受到資料列規則限制。

---

## 一、整體心智圖

```text
PostgreSQL 權限系統
│
├─ 1. 誰？Role
│  │
│  ├─ 登入帳號
│  │  ├─ LOGIN
│  │  └─ PASSWORD
│  │
│  └─ 權限群組
│     └─ 通常沒有 LOGIN
│
├─ 2. Role 本身有什麼能力？
│  ├─ LOGIN
│  ├─ CREATEDB
│  ├─ CREATEROLE
│  └─ SUPERUSER
│
├─ 3. Role 對哪些物件有權限？
│  │
│  ├─ Database
│  │  └─ CONNECT
│  │
│  ├─ Schema
│  │  └─ USAGE
│  │
│  └─ Table
│     ├─ SELECT
│     ├─ INSERT
│     ├─ UPDATE
│     └─ DELETE
│
├─ 4. 權限怎麼取得？
│  │
│  ├─ 直接授權給登入 Role
│  │
│  └─ 透過加入權限 Role
│     └─ Role Membership
│
└─ 5. 即使有 Table 權限
   └─ 仍可能受到 Row-Level Security 限制
```

---

## 二、Role 是 PostgreSQL 權限系統的核心

PostgreSQL 不把「使用者」與「群組」設計成兩種完全不同的物件。

兩者本質上都是：

```text
Role
```

差別主要在於有沒有 `LOGIN`。

```text
Role
├─ 有 LOGIN
│  └─ 可以作為登入帳號
│
└─ 沒有 LOGIN
   └─ 通常作為權限群組
```

例如：

```sql
CREATE ROLE ken LOGIN PASSWORD 'secret';

CREATE ROLE app_readonly;
```

意思是：

```text
ken
├─ 是一個 Role
├─ 可以登入
└─ 有密碼可用於認證

app_readonly
├─ 也是一個 Role
├─ 不能直接登入
└─ 通常用來集中管理權限
```

因此可以先記住：

> PostgreSQL 裡的 User，本質上只是具有 LOGIN 能力的 Role。

---

## 三、Role 屬性與物件權限是兩回事

這兩類概念容易被混在一起。

```text
Role
│
├─ Role 自己的屬性
│  ├─ LOGIN
│  ├─ PASSWORD
│  ├─ CREATEDB
│  ├─ CREATEROLE
│  └─ SUPERUSER
│
└─ Role 對某個物件的權限
   ├─ CONNECT
   ├─ USAGE
   ├─ SELECT
   ├─ INSERT
   ├─ UPDATE
   └─ DELETE
```

### 1. Role 自己的屬性

例如：

```sql
CREATE ROLE ken LOGIN PASSWORD 'secret';
```

這是在描述 `ken` 這個 Role 本身：

```text
LOGIN
└─ 能不能拿 ken 當登入帳號

PASSWORD
└─ 登入時如何驗證 ken 的身份
```

其中 `PASSWORD` 嚴格來說不算 privilege，比較像認證資訊。

即使 `ken` 可以登入，也不代表它能查詢任何資料表。

```text
可以登入 PostgreSQL
≠
可以存取所有資料
```

---

### 2. 對物件的權限

這些權限一定會搭配某個 Object。

```text
CONNECT → Database
USAGE   → Schema
SELECT  → Table 或 View
```

例如：

```sql
GRANT CONNECT ON DATABASE shop TO ken;

GRANT USAGE ON SCHEMA sales TO ken;

GRANT SELECT ON TABLE sales.orders TO ken;
```

這是在描述：

```text
ken 對不同物件能做什麼
```

而不是在修改 `ken` 本身的登入能力。

---

## 四、查詢資料時需要通過多層權限

假設 `ken` 想執行：

```sql
SELECT * FROM sales.orders;
```

通常需要通過三道門：

```text
ken
│
├─ Database shop
│  └─ CONNECT
│
├─ Schema sales
│  └─ USAGE
│
└─ Table sales.orders
   └─ SELECT
```

可以把它想成辦公大樓門禁：

```text
CONNECT
└─ 能不能進大樓

USAGE
└─ 能不能進某個樓層

SELECT
└─ 能不能打開某個檔案櫃
```

對應 SQL：

```sql
GRANT CONNECT ON DATABASE shop TO ken;

GRANT USAGE ON SCHEMA sales TO ken;

GRANT SELECT ON TABLE sales.orders TO ken;
```

濃縮成：

```text
成功查詢 sales.orders
=
Database CONNECT
+
Schema USAGE
+
Table SELECT
```

---
# 以一個典型全端專案來說

注意 docker 初始化帳號是 superuser，日常不應該使用。

```
Docker Compose
│
├─ PostgreSQL container
│  │
│  ├─ 初始化管理 Role：postgres
│  │  ├─ 由 POSTGRES_USER 建立
│  │  ├─ 建立初始 Database
│  │  └─ 執行 init scripts
│  │
│  └─ App Role：myapp_app
│			├─ Role 屬性
│			│  ├─ LOGIN
│			│  ├─ NOSUPERUSER
│			│  ├─ NOCREATEDB
│			│  └─ NOCREATEROLE
│			│
│			└─ Object Privileges
│			   ├─ CONNECT ON DATABASE myapp
│			   └─ USAGE、CREATE ON SCHEMA public # Mirgration 會用到這個
│
├─ Backend container
│  └─ 使用 myapp_app 連 PostgreSQL
│
└─ Frontend
   └─ 不直接知道 PostgreSQL 帳號與密碼
```

App Role: 
* 可以登入
* 可以連到 myapp (Database)
* 可以使用 public schema
* 可以在 public schema 建立 table
* 不能建立其他 Database
* 不能建立其他 Role
* 不是 Superuser
