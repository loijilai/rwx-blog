---
publish: true
tags:
  - SQL
date:
comments: true
---
這邊要討論的不是一般的sql injection，而是在LIKE pattern中出現的情況。

我學到的教訓：即使使用了參數化查詢，仍然需要處理 `LIKE` 的特殊字元，例如 `%`、`_` 與 `[`

## 情境：實作搜尋功能

在撰寫搜尋功能時，我們常會使用 `LIKE` 搭配萬用字元 `%` 來做模糊比對。例如：

```sql
WHERE MediaName LIKE @UserInput
```

並在Csharp中將參數設為：

```csharp
var userInput = ... // 取得使用者的輸入
parameters.Add("UserInput", $"%{userInput}%");
```

表面上看起來這是安全的做法，因為使用了參數化查詢，可以避免傳統的 SQL Injection。

## LIKE 的特殊字元

在 SQL Server 裡：

|字元|意義|
|---|---|
|`%`|任意長度字串|
|`_`|任意一個字元|
|`[` `]`|字元集合|
但如果使用者想輸入的影音真的就叫做`%`，因此輸入 `%`查詢，實際送進資料庫的條件就會變成：

```sql
WHERE MediaName LIKE '%%%'
```

這段條件其實等同於 `LIKE '%'`。在 SQL 中，`%` 代表任意長度的任意字串，因此 `LIKE '%'` 幾乎會匹配資料表中所有非 NULL 的資料列。換句話說，這個條件不再具有任何篩選能力。

資料庫在決定如何執行查詢時，會根據條件是否具有「選擇性」來決定是否使用索引。如果條件可以明確縮小範圍，例如 `LIKE 'abc%'`，資料庫可以利用索引直接定位到以 `abc` 開頭的資料區段，這種方式稱為 Index Seek，效率很高。

但當條件是 `LIKE '%abc%'` 時，字串的開頭不固定，資料庫無法透過索引快速定位，只能逐筆比對每一列資料，這通常會變成 Index Scan 或 Table Scan。

當條件進一步變成 `LIKE '%%%'` 時，資料庫會發現這個條件幾乎等於沒有條件。既然所有資料都需要被讀取，那麼使用索引來定位特定範圍就沒有意義，最合理的執行策略就是直接掃描整張資料表，也就是所謂的全表掃描。

## 解決方法

為了避免使用者透過這些特殊字元影響查詢邏輯，可以在送入資料庫前，先對字串進行跳脫處理。以下是一個常見做法：

```csharp
private string EscapeLikePattern(string input)
{
    if (string.IsNullOrEmpty(input)) return input;

    return input
        .Replace("[", "[[]")
        .Replace("%", "[%]")
        .Replace("_", "[_]");
}
```

在組合參數時，先將使用者輸入經過這個方法處理，再加入萬用字元：

```csharp
var userInput = ... // 取得使用者的輸入
var escaped = EscapeLikePattern(userInput);
parameters.Add("UserInput", $"%{escaped}%");
```

這樣做之後，使用者即使輸入 `%` 或 `_`，資料庫也只會把它們當成普通字元比對，而不會改變搜尋語意。如此一來，可以避免查詢退化成全表掃描，同時讓搜尋行為更可預期。