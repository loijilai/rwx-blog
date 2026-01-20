---
publish: true
tags:
date: 2026-01-20
comments: true
---
## 前言

當你第一次接到「查詢速度太慢」的回饋時，可能會感到困惑。明明程式碼看起來很簡潔，SQL 查詢也只寫了一段，為什麼效能會這麼差？

文用一個常見的例子：**訂單（Order）與商品（Product）**，來說明什麼是 N+1 查詢問題，以及如何將查詢次數從大量的 N+1 次，優化成固定的 1+2 次。

---

## 問題情境：訂單列表 API

假設我們正在開發一個電商後台 API，用來查詢訂單列表。每一筆訂單除了基本資訊（訂單編號、客戶名稱、下單時間）之外，還需要回傳兩種關聯資料：

- 訂單包含的商品清單
- 訂單使用的折扣（或優惠券）清單
    

資料表關係大致如下：
- `Orders`：訂單主表
- `OrderProducts`：訂單與商品的對應表（一筆訂單對應多個商品）
- `OrderCoupons`：訂單與優惠券的對應表（一筆訂單可能使用多張優惠券）
    
---

## 舊版實作：看似方便的相關子查詢

一開始，我們可能會寫出這樣的 SQL：

```sql
SELECT
    O.OrderId,
    O.CustomerName,
    Products = (
        SELECT ProductId
        FROM OrderProducts
        WHERE OrderId = O.OrderId
        FOR JSON PATH
    ),
    Coupons = (
        SELECT CouponCode
        FROM OrderCoupons
        WHERE OrderId = O.OrderId
        FOR JSON PATH
    )
FROM Orders AS O
WHERE ...
```

在應用層，我們只需要負責把查詢結果 mapping 成 DTO：

```csharp
public OrderDto Map(OrderRaw raw)
{
    return new OrderDto
    {
        OrderId = raw.OrderId,
        CustomerName = raw.CustomerName,
        Products = ParseProducts(raw.Products),
        Coupons = ParseCoupons(raw.Coupons)
    };
}
```

這樣的寫法在資料量很小時完全沒問題，而且可讀性也不差，因此很容易在專案初期被採用。

---

## 真正的問題：隱藏的 N+1 查詢

問題出在 SQL 裡的 **相關子查詢（Correlated Subquery）**。

假設這個 API 一次回傳 100 筆訂單，資料庫實際執行的行為是：

- 1 次查詢 `Orders`
- 對每一筆訂單，執行 1 次查詢 `OrderProducts`
- 再對每一筆訂單，執行 1 次查詢 `OrderCoupons`
    
也就是：1 + (100 × 2) = 201 次查詢

當訂單數量成長到 1000 筆時，就會變成 **2001 次查詢**。這正是典型的 N+1 問題，只是被包裝在「一個 SQL」裡，更不容易被察覺。

背景資料：https://youtu.be/tvBp81WVrCA?si=j4zomdYKXd2kIBQU&t=3987

---

## 新版實作：從 N+1 變成 1+2

核心想法很簡單：與其讓資料庫重複查詢，不如一次把所有關聯資料取出來，在記憶體中組裝。

我們把原本的查詢拆成 **1 個主查詢 + 2 個批次查詢**。

### 查詢一：訂單基本資料

```sql
SELECT OrderId, CustomerName, OrderDate
FROM Orders
WHERE ...
```

### 查詢二：一次查出所有訂單的商品

```sql
SELECT OrderId, ProductId
FROM OrderProducts
WHERE OrderId IN (1, 2, 3, ..., 100)
```

### 查詢三：一次查出所有訂單的優惠券

```sql
SELECT OrderId, CouponCode
FROM OrderCoupons
WHERE OrderId IN (1, 2, 3, ..., 100)
```
注意關鍵的差異：我們使用IN子句一次性查詢所有需要的 OrderId，而不是針對每一筆分別查詢。

---

## 實際Demo程式要怎麼寫？

以上三個最主要的SQL查詢，實際上要怎麼整合進service & repository的API架構中？
### Repository 內部的實作方式

來看看 Repository 層是如何實作「批次查詢」的。
以查詢訂單商品為例，我們會提供一個明確以 **多個 OrderId 為輸入** 的方法：

```csharp

public async Task<IDictionary<long, List<int>>> GetProductsByOrderIdsAsync(IEnumerable<long> orderIds)
{
    using var connection = new SqlConnection(_connectionString);

    const string sql = @"
        SELECT OrderId, ProductId
        FROM OrderProducts
        WHERE OrderId IN @OrderIds";

    var rows = await connection.QueryAsync<(long OrderId, int ProductId)>(
        sql,
        new { OrderIds = orderIds.ToList() }
    );

    return rows
        .GroupBy(x => x.OrderId)
        .ToDictionary(
            g => g.Key,
            g => g.Select(x => x.ProductId).ToList()
        );
}
```

這個方法有幾個重點：
- 查詢只會執行一次，不論有多少筆訂單
- 回傳型別是 `Dictionary<OrderId, List<ProductId>>`，也就是根據每個主訂單資料下，把這個訂單下的所有ProductId都列出來
- Repository 內部就先完成分組，讓 Service 層可以 O(1) 取用

### Service 層如何協調這些資料

有了乾淨的 Repository API，Service 層的責任就變得非常單純：

在 Service 層，流程會變成：

1. 查詢訂單主資料（一次）
2. 從主資料中收集所有 `OrderId`
3. 呼叫 Repository 的批次方法，一次查出所有商品與優惠券
4. 在 Service 層依 `OrderId` **分組，組裝成最終 DTO

```csharp
// 1. 查詢訂單主資料（一次）
var orders = await _orderRepo.GetOrdersAsync(...);
var orderList = orders.ToList();

if (!orderList.Any())
{
    return new List<OrderDto>();
}

// 2. 從主資料中收集所有 `OrderId`
var orderIds = orderList.Select(o => o.OrderId).ToList();

// 3. 呼叫 Repository 的批次方法，一次查出所有商品與優惠券
var productsTask = _orderRepo.GetProductsByOrderIdsAsync(orderIds);
var couponsTask = _orderRepo.GetCouponsByOrderIdsAsync(orderIds);

await Task.WhenAll(productsTask, couponsTask);

var productsDict = await productsTask;
var couponsDict = await couponsTask;

// 4. 在 Service 層依 `OrderId` **分組，組裝成最終 DTO
var result = orderList.Select(order => new OrderDto
{
    OrderId = order.OrderId,
    CustomerName = order.CustomerName,
    Products = productsDict.GetValueOrDefault(order.OrderId, new List<int>()),
    Coupons = couponsDict.GetValueOrDefault(order.OrderId, new List<string>())
}).ToList();
```

這裡的巧思在於：
- Service 層明確控制查詢順序與次數，避免隱性 N+1
- 使用 `Task.WhenAll` 讓多個獨立查詢並行執行
    

---

## 為什麼不直接 JOIN？

你可能會問：為什麼不直接用 JOIN 一次把 Orders、Products、Coupons 全部查出來？

答案是：JOIN 會造成資料列爆炸。

如果一筆訂單有 3 個商品、2 張優惠券，JOIN 後會產生 6 筆重複的訂單資料，應用層還是需要額外做分組與去重。

相較之下，1+2 的查詢方式：

- 查詢次數固定
- 回傳資料結構單純
- 組裝邏輯清楚、可維護性高

---
## 總結

這個「訂單與商品」的例子，和實務上許多系統（影音、文章、會員、權限）的關聯查詢本質完全相同。

當你看到以下訊號時，就應該提高警覺：

- 主查詢回傳一個清單
- 對清單中的每一筆資料再去查關聯資料
- 查詢邏輯被包在 ORM、子查詢或 helper method 裡

這次經驗讓我學到隱藏在關聯子查詢中的效能問題，並透過應用層的查詢方式，讓查詢效率從N+1變成1+2，大幅提升速度。