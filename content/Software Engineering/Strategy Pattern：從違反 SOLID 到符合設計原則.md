---
publish: true
tags:
  - design-pattern
date: 2026-01-20
comments: true
---
## 前言

當你在開發系統時，是否曾經寫過一個充滿 `switch` 或 `if-else` 的方法，每次新增功能都必須回來修改這個方法？這種情況違反了 SOLID 原則中的 Open/Closed Principle（開放封閉原則），意思是軟體應該對擴展開放，對修改封閉。Strategy Pattern 策略模式正是解決這個問題的有效方法。

本文將透過一個容易理解的範例，帶你理解 Strategy Pattern 的核心思維，以及如何在實際專案中應用。

## 問題情境：電商訂單的折扣計算

假設你正在開發一個電商系統，其中有一個需求是「根據不同的折扣規則計算訂單最終金額」。系統可能會支援多種折扣方式，例如：

- 無折扣
- 固定金額折扣（例如折 100 元）
- 百分比折扣（例如 9 折）
- 會員專屬折扣

使用者在結帳時，系統會根據選擇或符合的折扣類型來計算實際付款金額。

### 初始實作（問題版本）

一開始，你可能會這樣寫：

```csharp
public decimal CalculateFinalPrice(decimal originalPrice, string discountType)
{
    switch (discountType)
    {
        case "none":
            return originalPrice;

        case "fixed":
            return originalPrice - 100;

        case "percentage":
            return originalPrice * 0.9m;

        case "vip":
            return originalPrice * 0.85m;

        default:
            throw new ArgumentException("Unknown discount type");
    }
}
```

這段程式碼乍看之下沒有問題，但隨著需求增加，很快就會遇到麻煩。

## 問題分析：為什麼這樣寫會出問題

這個方法有幾個典型的壞味道：

1. **違反 Open/Closed Principle**：每新增一種折扣規則，就必須修改這個方法。
2. **責任過重**：這個方法同時負責「判斷折扣類型」與「實作折扣邏輯」。
3. **可測試性差**：你無法單獨測試某一種折扣邏輯，只能測試整個方法。

如果未來要新增「節慶限時折扣」、「滿額折扣」、「新用戶折扣」，這個 `switch` 很快就會失控。

## 核心思考：辨識「會變動的部分」

當你遇到類似的問題時，最核心的思考方式是：找出程式碼中「會變動的部分」和「穩定的部分」。

在這個例子中：
- **穩定的部分**：計算訂單最終價格這件事
- **會變動的部分**：不同折扣的計算方式

一旦你辨識出這個區別，解決方案就呼之欲出：「把會變動的部分抽離出來」，讓它可以獨立變化，而穩定的部分保持不變。這就是 Strategy Pattern 的核心概念。

## Strategy Pattern 的本質

Strategy Pattern 的本質是將演算法（或行為）封裝成獨立的物件。每個物件代表一種策略，它們都實作相同的介面，因此可以互相替換。使用策略的客戶端程式碼不需要知道每個策略的具體實作細節，只需要知道它們都遵守相同的介面即可。

在我們的案例中，每種折扣處理邏輯就是一種策略。我們可以為每種條件建立一個獨立的策略類別，它們都實作相同的介面。當主程式需要處理某個條件時，只需要找到對應的策略物件，呼叫它的方法即可。

在這個電商情境中：

- **策略（Strategy）**：每一種折扣計算方式
- **共同介面**：都能「根據原價，算出折扣後價格」
- **Context（使用策略的角色）**：結帳流程

## 重構步驟

### 步驟一：定義策略介面

```csharp
public interface IDiscountStrategy
{
    string DiscountType { get; }
    decimal Apply(decimal originalPrice);
}
```

這個介面清楚定義了：
- 每個折扣策略如何被識別（`DiscountType`）
- 如何計算折扣（`Apply`）
    

### 步驟二：實作具體策略

#### 無折扣

```csharp
public class NoDiscountStrategy : IDiscountStrategy
{
    public string DiscountType => "none";

    public decimal Apply(decimal originalPrice)
    {
        return originalPrice;
    }
}
```

#### 固定金額折扣

```csharp
public class FixedAmountDiscountStrategy : IDiscountStrategy
{
    public string DiscountType => "fixed";

    public decimal Apply(decimal originalPrice)
    {
        return originalPrice - 100;
    }
}
```

#### 百分比折扣

```csharp
public class PercentageDiscountStrategy : IDiscountStrategy
{
    public string DiscountType => "percentage";

    public decimal Apply(decimal originalPrice)
    {
        return originalPrice * 0.9m;
    }
}
```

每個策略都只關心一件事：**怎麼算折扣**。
這樣做的好處是每個策略類別都非常專注，它只負責一件事情。當你需要修改「百分比折扣」的處理邏輯時，只需要修改 `PercentageDiscountStrategy` 這個類別，完全不會影響其他折扣的處理。

### 步驟三：重構主程式的計算流程（Context）

```csharp
public class CheckoutService
{
    private readonly Dictionary<string, IDiscountStrategy> _strategies;

    public CheckoutService(IEnumerable<IDiscountStrategy> strategies)
    {
        _strategies = strategies.ToDictionary(
            s => s.DiscountType,
            s => s,
            StringComparer.OrdinalIgnoreCase);
    }

    public decimal CalculateFinalPrice(decimal originalPrice, string discountType)
    {
        if (!_strategies.TryGetValue(discountType, out var strategy))
            throw new ArgumentException("Unknown discount type");

        return strategy.Apply(originalPrice);
    }
}
```

現在主程式`CheckoutService`的職責變得非常簡單：建立策略映射表，然後根據條件找到對應的策略並執行，他不需要知道任何折扣細節。

## 重構前後的差異

**重構前**：
- 新增折扣 = 修改 `switch`
- 多人同時改同一個方法，容易衝突
    
**重構後**：
- 新增折扣 = 新增一個 Strategy 類別
- 原有程式碼完全不用改
    
這就是 Open/Closed Principle 的實際體現。


## Mental Model：如何在真實專案中套用

當你在專案中看到以下徵兆時，就可以考慮 Strategy Pattern：
- 一個方法裡有很長的 `switch / if-else`
- 每個分支都在做「同一件事，但方式不同」
- 新需求幾乎一定會新增分支


## 結論
Strategy Pattern 的核心是「辨識並封裝變化」。當你看到程式碼中有一個會隨著需求變動的部分，將它抽取成獨立的策略物件，讓主程式只負責協調，不負責具體的業務邏輯。

這樣做的好處是符合 SOLID 原則，特別是單一職責原則和開放封閉原則。你的程式碼會變得更容易測試、更容易閱讀、更容易擴展。當新的需求來臨時，你只需要新增新的策略類別，而不需要修改既有的程式碼。

記住這個 Mental Model：找出變化點、封裝成策略、建立映射機制、簡化主程式。下次當你看到一個充滿 `switch` 或 `if-else` 的方法時，你就知道該如何重構了。