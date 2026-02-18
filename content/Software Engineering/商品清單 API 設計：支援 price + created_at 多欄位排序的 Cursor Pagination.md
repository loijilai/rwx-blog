---
publish: true
tags:
  - Api-design
date:
comments: true
---
假設前端需要顯示商品清單，欄位包含：

- id
- name
- price
- created_at
    

使用者可以同時依照 price 與 created_at 排序，並採用無限滾動載入更多資料。以下整理一個完整設計方式，包含資料庫設計、查詢邏輯與 API 規格。

# 一、為什麼不用 offset 分頁

傳統分頁做法：

```sql
SELECT *
FROM products
ORDER BY price ASC
LIMIT 20 OFFSET 1000;
```

問題有兩個：

1. offset 越大，資料庫仍需掃描前面資料，效能線性下降。    
2. 若翻頁期間有資料新增或刪除，可能出現重複或遺漏。

當資料量成長後，這種方式會變慢且不穩定。

因此改用 cursor-based pagination（又稱 keyset pagination）。

# 二、多欄位排序的關鍵：排序必須 deterministic

假設只用：

```sql
ORDER BY created_at DESC
```

若多筆資料 created_at 相同，資料順序在邏輯上並不唯一。像是下面這張表格，created_at相同的很多，不知道要從哪一筆開始取用資料。

|id|created_at|
|---|---|
|510|2026-01-10 12:00:00|
|505|2026-01-10 12:00:00|
|500|2026-01-10 12:00:00|
|498|2026-01-09 18:00:00|

解法是加入唯一欄位作為 tie-breaker，例如 id。若支援 price + created_at 排序，完整排序應為：

```sql
ORDER BY price ASC, created_at DESC, id ASC
```

原則：

- 所有排序都必須包含唯一欄位
- 排序順序必須固定

否則 cursor 無法準確定位資料位置。

# 三、資料庫設計

## 資料表

```sql
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 索引設計

若主要排序為：price ASC, created_at DESC, id ASC

應建立複合索引：

```sql
CREATE INDEX idx_products_price_created_id
ON products (price ASC, created_at DESC, id ASC);
```

索引順序必須與 ORDER BY 一致，否則查詢可能退化為全表掃描。

# 四、Cursor 設計

Cursor 必須包含：

1. 所有排序鍵值
2. 唯一欄位 id
3. 排序資訊（用來驗證）
    
範例（JSON 形式）：

```json
{
  "price": 100,
  "created_at": "2026-01-10T12:00:00Z",
  "id": 510,
  "sort": ["price", "created_at", "id"],
  "order": ["asc", "desc", "asc"]
}
```

實際傳輸時應 base64 編碼，並視為不透明字串。

# 五、下一頁查詢邏輯

假設排序為：

```sql
price ASC, created_at DESC, id ASC
```

最後一筆為：
```
price = 100  
created_at = 2026-01-10T12:00:00Z  
id = 510
```

下一頁條件應為：

```sql
WHERE
  (price > 100) -- 因為 price ASC 所以是 >
  OR (price = 100 AND created_at < '2026-01-10T12:00:00Z') -- 因為 created_at DESC 所以是 <
  OR (price = 100 AND created_at = '2026-01-10T12:00:00Z' AND id > 510)
ORDER BY price ASC, created_at DESC, id ASC
LIMIT 20
```

這個條件必須完全對應排序規則。

# 六、API Spec 設計

## Endpoint

```http
GET /api/products
```

## Query Parameters

### sort
逗號分隔排序欄位：

```
sort=price,created_at
```

### order
對應 sort 的排序方向：

```
order=asc,desc
```

長度必須一致，否則回傳 400。

### limit
每頁筆數，例如：

```
limit=20
```

建議設定上限，例如 100。

### cursor
由後端產生的 base64 字串。

### 舉例

```http
GET /api/products?sort=price,created_at&order=asc,desc&limit=20
```

# 七、Response 格式

```json
{
  "data": [
    {
      "id": 510,
      "name": "Product A",
      "price": 100,
      "created_at": "2026-01-10T12:00:00Z"
    }
  ],
  "page": {
    "next_cursor": "base64_string",
    "has_more": true
  }
}
```

---

# 八、排序變更的處理原則

Cursor 與排序條件強綁定，若使用者改變排序：

- 前端應丟棄舊 cursor，重新請求第一頁
* 後端在 decode cursor 時應驗證：sort和order 是否一致
    

若不一致，回傳 400，明確表示 cursor 已失效。

# 九、完整設計原則總結

1. 排序必須 deterministic，所以必須包含唯一欄位作為 tie-breaker。
    
2. cursor 必須包含所有排序鍵值。
    
3. 排序改變必須重置分頁。
    
4. 索引順序必須與 ORDER BY 一致。
