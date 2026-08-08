---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Celery 與 Django 是怎麼跑起來的|Celery 與 Django 是怎麼跑起來的]]
> - [[#Celery 取代了手刻 worker loop|Celery 取代了手刻 worker loop]]
> - [[#Celery Concurrency|Celery Concurrency]]

## Celery 與 Django 是怎麼跑起來的

目前專案已經從手刻 worker loop 進到 Celery + Redis 版本。Django 啟動時，Celery app 會透過 `durable_queue/__init__.py` 被載入：

```text
python manage.py runserver
        |
        v
manage.py 設定 DJANGO_SETTINGS_MODULE
        |
        v
django.setup()
        |
        v
import durable_queue.settings
        |
        v
Python 先 import durable_queue package
        |
        v
durable_queue/__init__.py
        |
        v
from .celery import app
        |
        v
建立 Celery app
        |
        v
app.config_from_object("django.conf:settings", namespace="CELERY")
        |
        v
Django 繼續載入 settings 與 INSTALLED_APPS
```

這裡的重點是 `namespace="CELERY"`。它代表 Django settings 中以 `CELERY_` 開頭的設定，會被 Celery app 讀取。例如：

```python
CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = "redis://localhost:6379/1"
CELERY_BROKER_TRANSPORT_OPTIONS = {
    "visibility_timeout": 3600,
}
```

Redis 與 Celery 的合作關係，Redis 提供了：
1. broker queue (list 所在的位置)
2. celery events channel (worker 會對這給channel 發事件) 這就是 flower 觀測到的
## Celery 取代了手刻 worker loop

手刻版本需要自己寫 polling loop：

1. worker 不斷查 DB。
2. 用 `select_for_update(skip_locked=True)` claim job。
3. 執行工作。
4. 更新 job 狀態。
5. sweeper 定期回收 timeout 的 running job。

Celery 版本把其中一部分責任交給 broker 與 worker runtime。

以 Redis broker 來說，可以簡化理解成：Celery worker 會從 Redis queue 取 task；沒有 task 時 worker 會阻塞等待，而不是一直打 DB polling。實作細節比單純 `BRPOP` 更複雜，因為 Celery 還要維護 unacked task 與 visibility timeout，但概念上可以理解成從「自己 polling DB」改成「worker 等 broker 派任務」。

目前 Celery task 的幾個重要設定是：

```python
@shared_task(
    base=ExecuteJobTask,
    acks_late=True,
    autoretry_for=(ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def execute_job(job_id):
    ...
```

- `acks_late=True`：worker 會在 task 執行完成後才 ACK。若 worker 執行中途掛掉，broker 之後可以重新派發 task。這是 at-least-once 的基礎。
- `autoretry_for=(ConnectionError, TimeoutError)`：遇到指定的暫時性錯誤時自動 retry。
- `max_retries=3`：最多重試 3 次。
- `retry_backoff=True`：使用 exponential backoff，避免立刻重試造成下游壓力。
- `retry_jitter=True`：在 retry delay 中加入隨機抖動，避免大量任務同時重試。
- `visibility_timeout=3600`：Redis broker 中 unacked task 超過 1 小時仍未 ACK 時，會被視為可重新派發。

這些設定對應到手刻版本大概是：

| 手刻 DB queue | Celery + Redis |
| --- | --- |
| worker loop polling | Celery worker 從 broker 取 task |
| `select_for_update()` claim job | broker 派發 task 給 worker |
| sweeper loop 回收 lease | broker visibility timeout |
| retry loop / attempt limit | `autoretry_for` + `max_retries` |
| timeout 後重新處理 | late ACK + redelivery |

要注意：即使用了 Celery，資料庫仍然是 job 狀態的真相來源。Redis broker 負責派工，但 `TranscriptionJob.status` 才是 API 查詢時看到的狀態。

## Celery Concurrency

**一個 worker 主進程**,但它**本身不執行任務**。它是個協調者,底下用 **prefork pool** fork 出 N 個**子進程**(child worker processes),真正在跑 task 的是這些子進程。

`N` = `--concurrency` 參數,**你沒設 → 預設 = 這台機器的 CPU 核心數**。所以一台 4 核的機器,你以為「1 個 worker」,實際上容器裡有 **4 個子進程並行在消化任務**。

`select_for_update` 確實在 `mark_running/succeeded/failed/retry_job` 都在,guard 也在。但你這句「celery 保證從 redis 拉不會 race」講得太順,漏了關鍵:

**正常派工下,兩個 worker 永遠不會碰到同一個 job** —— 一則 broker message 只會投遞給一個 worker。所以如果只有正常派工,你的 `select_for_update` 根本用不到。

那它在防什麼?回想你 Phase 2 設的 `visibility_timeout=3600` + `acks_late`。**唯一**讓 worker A 和 worker B 同時跑 `execute_job(同一個 id)` 的情境是:A 拿了任務、卡住超過 3600s 沒 ack → broker 判定 A 死了 → **把同一則訊息重投給 B** → 這下 A、B 真的並行在同一個 job 上。你的 app-layer 鎖 + idempotency guard 擋的是**這個重投雙跑窗口**,不是正常派工。

補一刀:worker=1 時其實也擋得到(Celery prefork 預設併發 = CPU 數,單一 worker 容器內就有多個 process 可能雙跑)。所以鎖本來就需要——**HA 只是把它從「偶爾」變成「常態」**。你答對了機制,我要你能講出「鎖保護的是 redelivery,不是 dispatch」這句話。
