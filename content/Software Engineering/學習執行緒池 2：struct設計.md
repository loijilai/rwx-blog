---
publish: true
tags:
  - C-programming
date: 2025-09-01
---
# 本篇目標

前一篇([[學習執行緒池 1：設計方陣乘法的API]])重點在於定義API，這篇的重點在於「如何設計 struct tpool」，目標是定義執行緒池的基本結構。

最終程式碼：[Cpp-Projects/thread-pool/thread-pool.c at main · loijilai/Cpp-Projects (github.com)](https://github.com/loijilai/Cpp-Projects/blob/main/thread-pool/thread-pool.c)

# **我們要解決的問題**

1. **如何傳遞計算任務？**
   * 需要一個task queue來讓主執行緒存放方陣計算請求
1. **如何管理眾多執行緒？**
   * 需要一個固定大小的執行緒陣列

# task queue設計

我們先處理第一個問題：**如何傳遞計算任務？**

首先我們會需要一個task structure存放切分過後的request。

```cpp
typedef struct task {
    int row_index;
    Matrix A;
    Matrix B;
    Matrix C;
    struct task *next;
} task_t;
```

這表示每個工作執行緒會計算A * B = C中，C的第`row_index`個row的值。

這部分在討論用鏈結串列實作佇列，如果對DSA很熟的讀者可以放心跳過。

在用C實作queue上通常有分兩種選擇：

1. 初始化時，head tail都指向NULL，操作過程全程保持head指向佇列中第一個元素，tail指向佇列中最後一個元素
2. 初始化時，head tail都指向dummy，操作全程保持head指向dummy node，tail指向佇列中最後一個元素

## 第一個方法要注意

```cpp
// 初始化
q->head = NULL;
q->tail = NULL;
```

1. 當enqueue是第一個元素，也就是tail == NULL，要同步更新head  
    這讓人覺得有點煩，因為enqueue應該把重點放在tail的更新就好，很容易忘記同步更新head```
2. 當dequeue的是最後一個元素，也就是head == NULL，要同步更新tail  
    同理，dequeue的時候應該要把重點放在head的更新就好，很容易忘記同步更新tail
    
## 第二個方法讓head永遠指向dummy node

```cpp
// 初始化
struct QNode *dummy = malloc(sizeof(QNode));
q->head = dummy;
q->tail = dummy;
```

為了讓enqueue專注在tail，dequeue專注在head，我們採用第二個方法：

1. 初始化時讓head和tail都指向dummy node。
2. 整個enqueue/dequeue的過程中，head永遠指向dummy node，而tail指向最後一個元素，若queue中沒有元素則tail也指向dummy node。

這樣的設計可以簡化enqueue和dequeue的邏輯。

# **tpool structure設計**

了解task queue的設計之後，我們要開始設計tpool_t。

剛剛第一個問題是如何傳遞計算任務？所以設計一個task queue來讓主執行緒存放方陣計算請求

```cpp
    task_t *task_queue_head;
    task_t *task_queue_tail;
    pthread_mutex_t task_queue_mutex;
    pthread_cond_t task_queue_cond;
```

但因為主執行緒放任務，和工作執行緒取任務之間都會存取task queue，另外，工作執行緒之間也都會存去task queue，針對這種共享資源我們要新增一個`task_queue_mutex`。

另外我們不希望當task queue為空，工作執行緒一直busy waiting，所以設定一個condition variable `task_queue_cond`，用來讓主執行緒通知工作執行緒現在有task可以取用。

本篇的第二個問題是**如何管理眾多執行緒？這部分我們**需要一個固定大小的執行緒陣列。

```cpp
    int num_threads;
    pthread_t *threads;
```

整體的tpool設計看起來會是這樣，至於其他的狀態管理變數`pending_tasks`, `stop`和`sync_cond`則會在後續提到，目前可以先忽略。

```cpp
typedef struct tpool {
    // 執行緒相關
    int num_threads;          // 執行緒數量
    pthread_t *threads;       // 執行緒陣列

    // 工作佇列相關
    task_t *task_queue_head;  // 佇列頭（dummy node）
    task_t *task_queue_tail;  // 佇列尾
    pthread_mutex_t task_queue_mutex;  // 佇列鎖
    pthread_cond_t task_queue_cond;    // 佇列非空條件變數

    // 其他read-only共享變數
    int matrix_size;          // 矩陣大小（n * n）

		// 以下可以先忽略
    // 追蹤計算狀態
    int pending_tasks;        // 當前正在處理的任務數量
    pthread_cond_t sync_cond; // 讓tpool_synchronize()等待所有任務完成

    // 執行緒池關閉管理
    bool stop;                // 控制執行緒何時結束
} tpool_t;

```

# 下一步

下一篇[[學習執行緒池 3：如何讓主執行緒提交計算請求？]]會涵蓋：

1. **`tpool_request()` 如何將新工作加入佇列**
2. **執行緒如何從佇列取出並執行 → 生產者-消費者問題**
    1. 佇列需要執行緒安全，因為主執行緒會不斷加入任務，而執行緒池內的工作執行緒會從佇列取出並執行