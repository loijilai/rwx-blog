---
publish: true
tags:
  - csharp
date:
comments: true
---
這篇文章會收集一系列 LINQ 題目與解法。

---
## 題目 1：把「多對多」資料反轉成 Dictionary

### 問題

假設你有一份「商品分類」資料：每個商品 `ProductId` 會出現在多個分類 `CategoryIds` 裡。請輸出：

- Key：CategoryId
- Value：該分類底下有哪些 ProductId（去重）

期待輸出：

```txt
1 => [100, 200] // CategoryId = 1 之下的 ProductId 有 100 和 200
2 => [100] // CategoryId = 2 之下的 ProductId 有 100
```

### 範例資料

```csharp
using System.Text.Json;

var input = new[]
{
    new {
        ProductId = 100,
        CategoryIds = new List<int> { 1, 2 }
    },
    new {
        ProductId = 200,
        CategoryIds = new List<int> { 1 }
    },
    new {
        ProductId = 100,
        CategoryIds = new List<int> { 1 } // 故意重複 ProductId
    }
};
```

### 解法

```csharp
var result = input
    .SelectMany(x => x.CategoryIds.Select(cid => new { cid, x.ProductId }))
    .GroupBy(x => x.cid)
    .ToDictionary(
        g => g.Key,
        g => g.Select(x => x.ProductId).Distinct().ToList()
    );

Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
```

### 思路

這題可以記成：**SelectMany → GroupBy → ToDictionary**。

#### Step 1：SelectMany — 把「一筆資料」拆成多筆

`SelectMany` 的用途可以用一句話解釋：

> 把 IEnumerable\<IEnumerable\> 攤平成 IEnumerable

在這個例子裡，每一筆輸入長這樣：

```txt
(ProductId=100, CategoryIds=[1,2])
```

但我們要的中間型態是「每個分類一筆」：

```txt
(cid=1, ProductId=100)
(cid=2, ProductId=100)
```

所以我們先用 `Select` 把單筆資料變成多筆：

```csharp
x.CategoryIds.Select(cid => new { cid, x.ProductId })
```

而 `SelectMany` 的工作就是把「每筆的多筆」攤平。

SelectMany 後的結果長什麼樣？

```json
[
  { "cid": 1, "ProductId": 100 },
  { "cid": 2, "ProductId": 100 },
  { "cid": 1, "ProductId": 200 },
  { "cid": 1, "ProductId": 100 }
]
```

---

#### Step 2：GroupBy — 用 cid 把資料分桶

攤平後你就擁有一串 pair：

```txt
(cid=1, ProductId=100)
(cid=2, ProductId=100)
(cid=1, ProductId=200)
(cid=1, ProductId=100)
```

現在我們想依分類 id 分組：

```csharp
.GroupBy(pair => pair.cid)
```

這一步做完後，型別會變成：

```txt
IEnumerable<IGrouping<int, T>>
```

T 是 `new { cid, ProductId }` 的匿名型別。

> IGrouping 到底是什麼？

`IGrouping<TKey, TElement>` 可以把它想成：

> 一個「帶著 Key 的集合」

它同時有兩個身分：
1. 它有一個 Key
2. 它本身就是一個 IEnumerable
    
所以對於其中一個 group，例如 cid = 1：

```csharp
IGrouping<int, ???> g
```

你可以：

```csharp
g.Key                      // 1

g.Select(x => x.ProductId) // 100, 200, 100
```

**這件事很重要**：

> GroupBy 不會回傳 Dictionary。
> GroupBy 回傳的是「一堆 group」，每個 group 有 Key，且 group 本身能被列舉。

這就是後面 `ToDictionary` 能成立的根本原因。

---

#### Step 3：ToDictionary — 把每個 group 轉成 Key/Value

`ToDictionary` 會把 IEnumerable 轉成 Dictionary：
- `keySelector`: 決定 key 是什麼
- `elementSelector`: 決定 value 是什麼

在這裡：

```csharp
.ToDictionary(
    g => g.Key, // keySelector
    g => g.Select(x => x.ProductId).Distinct().ToList() // elementSelector
)
```

這段在做：

1. 從 group 中取出 ProductId   
2. 去重（Distinct）
3. 變成 List

最後就得到：

```json
{
  "1": [100, 200],
  "2": [100]
}
```

##  ToLookup, GroupBy, ToDictionary

[[C#] ToLookup, GroupBy, ToDictionary簡單介紹 | 愛流浪的小風 - 點部落 (dotblogs.com.tw)](https://dotblogs.com.tw/kirkchen/2011/07/16/toolookup_groupby_todicionary_introduction)

`ToLookup` 是立即分組的 one-to-many 查詢結構，適合後續多次依 key 查詢資料

你可以把它腦中翻譯成：
`Dictionary<TKey, List<TValue>>`

但型別是：
`ILookup<TKey, TValue>`

快速複習：
1. ToLookup立即執行，GroupBy延遲執行
2. ToLookup的key可以重複，ToDictionary不行；Key 不存在時，ToLookup會回傳空集合，ToDictionary會丟 exception