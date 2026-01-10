---
publish: true
tags:
date:
comments: true
---
# NET 記憶體與資源管理

如果你寫過一段時間的 .NET，遲早會遇到這種情況：畫面明明關掉了、物件理論上也不會再用了，但記憶體卻一直往上漲，最後不是效能變差，就是直接 OutOfMemory。

多數人在這個階段會以為是「GC 沒有正常工作」，但實際上，問題幾乎都不是 GC，而是**我們自己還在無意中握著物件的參考**。

這篇文章不會從 GC 演算法開始講，而是用你在專案中一定遇過的場景，帶你理解 .NET 記憶體與資源管理真正的運作方式。

## 為什麼「我沒用了」，GC 卻不回收？

在 .NET 裡，GC 判斷一個物件能不能被回收，其實只看一件事：**還有沒有任何地方可以一路找到它**。只要有參考存在，哪怕你主觀上覺得「這東西早就沒用了」，GC 都不會動它。

這也是為什麼記憶體問題通常不是來自複雜的演算法，而是來自一些看起來很正常、甚至每天都在寫的語法。

最常見的三個來源，就是 event、static，以及 lambda。


## Event：畫面關了，物件卻還被留在清單裡

很多人第一次寫 event，都把它當成「通知機制」。某個物件發生事情，就通知所有關心的人，這個理解沒有錯，但問題在於：**通知名單本身是有記憶的**。

想像你在寫一個畫面，裡面有個 Button：

```csharp
class Button
{
    public event Action Clicked;
}

class Page
{
    public Page(Button button)
    {
        button.Clicked += OnButtonClicked; // 註冊
    }

    void OnButtonClicked() { }
}
```

在你心中的流程可能是：使用者離開畫面，Page 就沒人用了，接下來交給 GC 處理。但實際上，Button 裡的 Clicked event 還記得 OnButtonClicked，而 OnButtonClicked 又是 Page 的方法。

關係圖：`Button -> event -> Page`

也就是說，只要 Button 還活著，Page 就一定活著。這跟畫面有沒有顯示、你還會不會再用到 Page，一點關係都沒有。

這就是為什麼在實務上，event 幾乎一定要有對應的 unsubscribe。不是因為語法要求，而是因為**不退訂，就等於主動告訴系統「請幫我留著這個物件」**。

## static：你以為是暫存，其實是終身合約

static 之所以危險，並不是因為它不好，而是因為它的生命週期太長了。只要應用程式還在跑，static 就一定存在。

例如下面這種寫法，在專案裡非常常見：

```csharp
class UserCache
{
    public static List<User> Users = new();
}
```

很多人會直覺地把它當成 cache，但從 GC 的角度來看，這其實是在宣告：所有 User 都要活到程式結束為止。因為 static 本身就是 GC Root，只要它還在，底下的物件永遠不會被回收。

關係圖：`static Users -> User`

這也是為什麼你會看到一些服務跑久了之後，記憶體只升不降。不是 GC 壞掉，而是你用 static 告訴 GC「這些我都還要」。

如果真的需要快取，就必須明確處理生命週期，而不是單純用 static 逃避管理成本。

## lambda：一行看似無害的程式，其實會拖住整個物件

lambda 很容易讓人誤會它只是「一小段程式碼」，但在 .NET 裡，lambda 實際上是一個物件，而且它可能會把外部的整個物件一起抓進來。

例如這段程式：

```csharp
Task.Run(() =>
{
    Console.WriteLine(this.Name);
});
```

如果這段程式寫在 Page 或 ViewModel 裡，那麼這個 lambda 其實會隱含地參考 this。只要 Task 還在跑，整個 Page 就不能被回收。

這在背景工作、長時間 Task、或被集中管理的 Task 清單中特別容易出問題。你可能只是想非同步載資料，但實際效果卻是：畫面關了，背後的物件卻全部被拖住。

## Finalize：為什麼加了反而更容易出事

### Finalize() 是為了解決什麼問題？

在 .NET 很早期的設計中：
- 有 unmanaged resource（檔案、socket、native handle）
- 如果開發者忘了清理，系統至少要有「最後補救機制」
這就是 Finalize 的由來。

很多人第一次看到 Finalize，會以為它是「保證清理資源」的機制。實際上，它只是最後的補救措施，而且代價很高。

當一個物件有 Finalize 時，GC 在第一次發現它不可達時，並不會立刻回收，而是先把它丟進 Finalization Queue，等待專門的 Finalizer Thread 處理。等 Finalize 跑完之後，還要再等下一次 GC，物件才會真的消失。
### 為什麼 Finalize 不能立刻執行？
因為 Finalize：
- 會執行任意程式碼
- 可能呼叫外部資源
- 不能在 GC 執行緒中亂跑

所以 CLR 的設計是：
1. 先標記物件需要 Finalize
2. 把它放進 Finalization Queue
3. 由專門的 Finalizer Thread 執行
4. 下一次 GC 才能真的回收

這代表什麼？代表只要你加了 Finalize，這個物件**一定會比其他物件多活至少一輪 GC**。如果你大量建立這類物件，清理速度就很容易追不上建立速度，最後不是記憶體暴增，就是資源耗盡。

因此，在應用程式層級，把 Finalize 當成主要清理方式，幾乎一定是錯的。

錯誤示範：
```csharp
class NativeFile
{
    ~NativeFile()
    {
        CloseHandle();
    }
}
```
## Dispose：真正可控、可靠的資源管理方式

Dispose 的價值，在於它是你主動做的選擇。你明確告訴系統：這個物件現在用完了，請立刻釋放它持有的資源。

GC 不會幫你呼叫 Dispose，因為 GC 只負責記憶體，它不知道什麼時候該關檔案、關連線、或釋放 handle。`Dispose`其實就是個一般的method，在GC眼裡`Dispose`就是個一般的方法。

### 那為什麼要 implement IDisposable？

因為 IDisposable 是一個「合約」，它不是自動清理機制。
它在告訴使用者：
- 這個物件用完一定要清
- 可以用 using / await using

```csharp
class FileService : IDisposable
{
    private FileStream _stream;

    public FileService(string path)
    {
        _stream = new FileStream(path, FileMode.Open);
    }

    public void Dispose()
    {
        _stream.Dispose();
    }
}
```

使用端：
```csharp
using var service = new FileService("data.txt");
```
當你看到 using 時，你可以很有信心地知道：這段程式結束時，資源一定會被釋放。不依賴 GC，不需要 Finalize。

## 什麼時候才真的需要 Finalize？

幾乎只有在寫 framework 或底層 library，包 unmanaged resource，而且不能完全信任使用者時，才需要 Finalize 作為保險。

對大多數應用程式開發者來說，理解它的成本與副作用，比實際使用它來得重要。


## 結語：心智模型

GC 並不是萬能的垃圾清潔工，它只會回收沒人再碰得到的記憶體。資源要不要釋放、什麼時候釋放，永遠是開發者的責任。

只要你能意識到 reference 的存在，理解 event、static、lambda 的生命週期，再搭配正確使用 Dispose，大部分的記憶體問題，其實都可以在還沒發生之前就避免掉。

最後總結：
- Dispose：你負責的清理
- IDisposable：提醒與規範
- Finalize：最後補救，不是策略

# References
這篇文章是我在讀這本書時遇到的問題，用AI協助總結成重點。

 [Clean Code 學派的風格實踐：重構遺留 Codebase，突破 C# 效能瓶頸 (Clean Code in C#: Refactor your legacy C# code base and improve application performance by applying best practices) | 天瓏網路書店 (tenlong.com.tw)](https://www.tenlong.com.tw/products/9789864347896)