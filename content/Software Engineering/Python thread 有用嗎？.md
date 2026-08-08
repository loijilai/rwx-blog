---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Python Thread 共用 GIL|Python Thread 共用 GIL]]
> - [[#Python Threads 有用嗎？|Python Threads 有用嗎？]]

# Python Thread 共用 GIL

CPython 有 GIL。簡化來說，在同一個 process 中，多個 Python thread 通常不能同時執行 Python bytecode。

```
同一 process：
thread 1 ─┐
thread 2 ─┼→ 共用一把 GIL
thread 3 ─┘
```

所以對 CPU-bound 工作，例如大量運算：

```
for _ in range(1_000_000_000):
    ...
```

多 thread 未必能真正使用多個 CPU core。

但不同 process 各有自己的 Python interpreter 與 GIL：

```
process 1 → GIL 1 → CPU core 1
process 2 → GIL 2 → CPU core 2
process 3 → GIL 3 → CPU core 3
```

因此多 process 可以真正利用多核心 CPU。
# Python Threads 有用嗎？

> Question: 如果python thread是共用GIL，那為什麼 I/O-bound，例如等 DB、Redis、外部 API；這時 thread 也可以有效提高併發，GIL 不代表 thread 完全沒用？

```
Python 處理：5 ms <-- 取得 GIL
等 PostgreSQL：80 ms
Python 組 response：5 ms <-- 取得 GIL
```

### I/O-bound

```
執行一點 Python
→ 等 DB 100 ms
→ 再執行一點 Python
```

大量時間是在等待，thread 可以趁空檔切換，提升併發。

### CPU-bound

```
持續執行 Python 計算 100 ms
```

整段都需要 GIL，多 thread 幫助有限。
