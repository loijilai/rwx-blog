---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#System Dependency|System Dependency]]
> - [[#Dockerfile 重點|Dockerfile 重點]]
>   - [[#1. Cache Layer Structure|1. Cache Layer Structure]]
>   - [[#2. WORKDIR|2. WORKDIR]]
>   - [[#3. Build Context 如何決定？|3. Build Context 如何決定？]]
> - [[#Docker Compose|Docker Compose]]
>   - [[#0. Build Context 如何決定？|0. Build Context 如何決定？]]
>   - [[#1. 環境變數覆蓋問題|1. 環境變數覆蓋問題]]
>   - [[#2. Docker Volume & Ports|2. Docker Volume & Ports]]
>   - [[#3. Container Networking|3. Container Networking]]
>   - [[#4. command, depends_on, database migration concurrency|4. command, depends_on, database migration concurrency]]

# System Dependency

容器化的第一步驟是先分析系統的 dependency。

![[1-queue-arch.png]]


同一個 image,不同 command
```
             ┌─────────────────────┐
   build ───►│  同一個 image        │  (同一份 code + requirements)
             └─────────────────────┘
                   │         │
      command:     │         │     command:
  gunicorn ...     ▼         ▼   celery -A ... worker
             [api 容器]  [worker 容器]

```

# Dockerfile 重點

## 1. Cache Layer Structure

```dockerfile
# 依賴套件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 專案程式碼
COPY . .
```

注意：
1. 影響 COPY 的順序
2. 了解`pip install --no-cache-dir` 

解釋：`--no-cache-dir` 

`pip install --no-cache-dir` 是為了防止 build image 過程中的 pip cache 被一起寫入 image。但我的疑問是，我又沒有 COPY pip cache 進去，為什麼 pip cache 會被寫入 image？

原來是要先了解 COPY 和 RUN 在做什麼？
```
COPY：外部檔案搬進來
RUN：在內部執行指令，記錄它造成的檔案變化
```

Docker image layer 不只記錄 `COPY` 進去的檔案，也記錄每個 `RUN` 指令對容器檔案系統造成的所有變更。

例如：
```dockerfile
FROM python:3.12-slim

RUN pip install requests
```

執行 `RUN` 時，Docker 會啟動一個暫時的 build container。`pip install` 會同時寫入：
```
/usr/local/lib/python3.12/site-packages/requests/   # 安裝完成的套件
/root/.cache/pip/                                   # pip 下載快取
```

這兩個位置都是該暫時容器檔案系統的一部分。`RUN` 結束後，Docker 會把**所有檔案系統變更**保存成 image layer：
```
Image layer
├── /usr/local/lib/python3.12/site-packages/...
└── /root/.cache/pip/...
```

因此，雖然你沒有：
```
COPY ~/.cache/pip/ /root/.cache/pip/
```

但它是 `pip install` 在 image build 過程中自己建立的，所以仍會進入 image，這樣會造成 image 體積大。

所以 `pip install --no-cache-dir` 不是防止 host 的 pip cache 被複製！

## 2. WORKDIR

```dockerfile
WORKDIR /app
COPY . .
```

左邊的 `.` 是 host 的 build context，右邊的 `.` 是容器內的 `/app`：

```dockerfile
COPY [host build context] [container /app]
```

### 為什麼要用`WORKDIR`而不用 `RUN cd /app`？

因為每個 `RUN` 都是獨立指令：

```dockerfile
RUN cd /app
RUN pwd
```

第二個 `RUN` 不會延續上一個 `cd`，通常仍在原本目錄。但 `WORKDIR` 會持續影響後續的所有指令

## 3. Build Context 如何決定？

Build Context 是 Docker 建置映像時可以存取的檔案範圍。`COPY`、`ADD` 與 `.dockerignore` 都會以這個範圍為基準。

通常 Build Image 有兩種方式，一種是手動下 docker 指令，一種是用`docker-compose.yaml`。

### 使用 `docker build`

Build Context 由指令最後一個路徑決定：

```bash
docker build -t myapp .
```

這裡的 `.` 代表「目前執行指令的目錄」。即使透過 `-f` 指定其他位置的 Dockerfile：

```bash
docker build -f docker/Dockerfile -t myapp .
```

Build Context 仍然是最後面的 `.`，不是 Dockerfile 所在的 `docker/` 目錄。

### 使用 Docker Compose

Build Context 由 `build.context` 指定：

```yaml
services:
  app:
    build:
      context: ./backend
      dockerfile: docker/Dockerfile
```

`build.context` 的相對路徑，以 「Compose 專案目錄」為基準解析。

Q: Compose 專案目錄是什麼東西？

Compose 專案目錄預設是「第一個 Compose File 所在的目錄」，也可以透過 `--project-directory` 指定。

假設 Compose 專案目錄是：

```text
/project
├── compose.yaml
└── backend
    └── Dockerfile
```

則上述設定會解析為：
```text
Build Context: /project/backend
Dockerfile:    /project/backend/docker/Dockerfile
```

其中：
- `build.context` 相對於 Compose 專案目錄。    
- `build.dockerfile` 相對於解析後的 Build Context。

# Docker Compose

Compose 負責的是**容器執行與部署設定**，這邊按照我給的順序讀，可以很快的抓到`docker-compose`的重點。

## 0. [[#Build Context 如何決定？]]

## 1. 環境變數覆蓋問題

這是 Compose 最容易混淆的部分。先看結論：

| 機制 | 發生時間 | 作用對象 | 主要用途 |
|---|---|---|---|
| `${VAR}` | Compose 解析 YAML 時 | Compose file | 替換 image tag、port 或其他 YAML 值 |
| `env_file` | Container 建立時 | Container environment | 批次注入 application 設定 |
| `environment` | Container 建立時 | Container environment | 明確設定或覆蓋個別變數 |
| `load_dotenv()` | Python process 啟動時 | Application process | 本機執行時讀取 `.env` |

以下例子：
```
    env_file:
      - .env
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/1
      - POSTGRES_HOST=postgres
```

> 把設定值注入容器成為「環境變數」，其中 `.env` 提供共用預設值，`environment` 則明確指定或覆蓋部分值。

### `env_file`: 把 .env 變成 OS 層級的環境變數

Q: 為什麼不把.env COPY進去容器？

注意 `.env`是透過`env_file`的方式，而不是 COPY 進入 image，這樣才能做到：
1. 在不同環境時，一份 image 可以用多份環境設定部署；改設定就不需要重新 build image
2. 避免密碼被打包進 image layer

假設 `.env`：

```
POSTGRES_DB=durable_queue
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secret
DJANGO_SECRET_KEY=abc123
```

Compose 啟動容器時，會把這些值放進容器的環境變數，Python 程式就能讀取：

```python
import os

db_name = os.environ["POSTGRES_DB"]
```

重點是：`.env` 不會自動變成 Django 設定；它只是先變成 OS 層級的環境變數，接著 Django 再透過 `os.environ` 讀取。

### `environment` vs. `env_file`

`environment` 的優先權高於 `env_file`。

因此可以把它理解成：

```
env_file      = 批次載入預設設定 (放本機版本設定可以直接 runserver、秘密、共用設定)
environment   = 明確設定／覆蓋特定設定 (放容器版本設定，像是docker內網的redis、postgres)
```

通常層級可以想成這樣：

```
docker compose up
        ↓
Compose 讀取 .env
        ↓
把 env_file 與 environment 合併
        ↓
environment 的同名值覆蓋 env_file
        ↓
建立容器並注入環境變數
        ↓
Django / Celery 透過 os.environ 讀取
        ↓
使用 postgres、redis 等 service name
透過 Compose 內部網路連到其他容器
```

### `load_dotenv()` vs. `env_file`

首先了解`load_dotnev()`的作用是：讀取 `.env` 檔案中的環境變數，並載入到目前程式的環境中，主要用於本機直接執行的情境。

預設情況下，`load_dotenv()` **不會覆蓋作業系統中已存在的環境變數**

Q: 雖然我是用compose env_file，但我程式裡還是有寫load_dotenv，效果會怎麼樣？

```
Compose env_file
    ↓
啟動容器時，已把變數從 .env 放進 OS environment
    ↓
程式執行 load_dotenv()
    ↓
又嘗試在容器檔案系統找 .env
```

compose env_file 已經在容器啟用的時候把 `.env` 放進環境變數了，這時候程式又試圖自己去讀 `.env`，但是我沒有把 `.env` COPY 進去容器中，所以：

```
# 結果一
容器內沒有 .env
└─ load_dotenv() 幾乎沒作用
   程式仍讀到 Compose 注入的環境變數

# 結果二
容器內有 .env
└─ load_dotenv() 會讀它
   但預設 override=False
   所以不會覆蓋 Compose 已注入的同名變數
```

> 結論：本機直接執行程式 → load_dotenv() 有用；Docker Compose 執行 → env_file 已完成注入，load_dotenv() 通常多餘但無害

### compose file 內部的`${...}` 會被自動替換

Q: 另外還有一個機制： compose file裡面的 ${...} 會被自動替換，這個和剛才理解的env_file和environment的關係是什麼？

```
${VAR}
└─ 讓 compose.yaml 本身可以參數化，Compose 解析階段的「文字替換」
   例如 image tag、port、volume path

env_file / environment
└─ 容器建立階段的「環境變數注入」
   讓 Django、Celery 用 os.getenv() 讀到
```

A: 用途不一樣

我在部署階段，在意的是環境變數設定應該用env_file和environment給容器，而${...}變數替換是讓 compose file 本身寫的比較 general 一點，實際要把環境變數傳給容器還是要靠 env_file 和 environment。

```
services:
  web:
    image: myapp:${APP_VERSION}

    env_file:
      - .env

    environment:
      POSTGRES_HOST: postgres
      DEBUG: ${DEBUG} # <--- Compose 先替換 ${DEBUG} 再由 environment 傳進容器
```
## 2. Docker Volume & Ports

```
volumes:
  - pgdata:/var/lib/postgresql/data
```

```
<本機:容器內>
```

此處的本機寫pgdata，是Docker 幫你管理的一個持久化儲存區，通常在本機的 `/var/lib/docker/volumes/pgdata/_data`。

## 3. Container Networking

每個 container 都有自己的 loopback interface 和 Docker network interface。

```text
Container
├── lo    → 127.0.0.1
└── eth0  → Docker network IP，例如 172.x.x.x
```

### 為什麼 Gunicorn 要綁定 `0.0.0.0`？

如果 Gunicorn 只監聽：

```bash
gunicorn config.wsgi --bind 127.0.0.1:8000
```

它只接受從該 container loopback interface 進來的連線。在 container 裡執行 `curl http://127.0.0.1:8000` 可能成功，但 host 經過 Docker port mapping 進來的流量，是送往 container 的 Docker network interface，不是 loopback。

```text
Host
  │ localhost:8000
  ▼
Docker port mapping
  │
  ▼
Container eth0:8000
```

因此 server 通常需要監聽：

```bash
gunicorn config.wsgi --bind 0.0.0.0:8000
```

在 server bind 的語意中，`0.0.0.0` 代表監聽所有 IPv4 interfaces，包括 loopback 與 Docker network interface。

### Container 之間不要使用 localhost

在 API container 裡，`localhost` 指的是 API container 自己，不是 PostgreSQL 或 Redis。

Compose 會替同一個 network 中的 service 提供 DNS name，因此 application 應使用 service name：

```text
POSTGRES_HOST=postgres
CELERY_BROKER_URL=redis://redis:6379/0
```

這裡的 `postgres` 和 `redis` 對應 Compose 中的 service 名稱。

### `ports` 只開放外部需要使用的服務

```yaml
services:
  api:
    ports:
      - "8000:8000"
```

`ports` 的格式可以理解成：

```text
HOST_PORT:CONTAINER_PORT
```

只有需要從 host 或外部進入的服務才需要 publish port。若 Redis 和 PostgreSQL 只供 Compose network 裡的 API 與 worker 使用，就不需要為它們設定 `ports`。

## 4. command, depends_on, database migration concurrency

Q: depends_on 保證什麼？不保證什麼？

A: 保證容器的啟用順序，但不保證就緒 (ready)，所以這之間有 race condition

需要等待 readiness 時，可以替 dependency 加上 health check，並讓 dependent service 等待 `service_healthy`：

```yaml
services:
  postgres:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    depends_on:
      postgres:
        condition: service_healthy
```

Application 本身仍應妥善處理暫時性的連線失敗，而不是把所有可靠性都寄託在啟動順序上。
