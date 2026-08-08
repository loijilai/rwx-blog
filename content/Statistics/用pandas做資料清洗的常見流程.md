---
publish: false
tags:
  - Python
  - data-cleaning
date:
comments: true
---
以下是我在做資料清洗時，把自己遵照的流程寫成一份筆記。

資料清洗往往需要許多步驟，如果沒有固定的流程就直接開始改欄位、刪缺值、轉型別，其實還沒理解資料長什麼樣子，就已經開始破壞資料了。後來我比較習慣把資料清洗拆成四個階段：

1. Inspect：先理解資料與問題
2. Clean：依照問題類型清理資料
3. Review：檢查清理結果是否合理
4. Export：輸出可重現、可追溯的乾淨資料

## Inspect：先理解資料

Inspect 階段最重要的任務，是先看出資料集常見的問題。

### 快速看資料長相

```python
df.head()
df.tail()
df.sample(5, random_state=42)
df.info()
```

`head()` 和 `tail()` 可以看前後幾筆資料，但它們可能剛好只看到排序後的局部樣貌。`sample()` 可以隨機抽幾筆，幫助我們看見比較真實的資料分布。

### Duplicate 與 Unique Value 檢查

```python
df.duplicated().sum()
```

```python
df["status"].value_counts(dropna=False)
df["status"].nunique(dropna=False)
```

`value_counts()` 很適合檢查 categorical value。常見問題包含：

- 大小寫不一致：`Paid`、`paid`、`PAID`
- 前後空白：`paid`、`paid `
- 同義值混雜：`M`、`Male`、`male`
- 缺值被字串化：`None`、`null`、`N/A`

如果某個欄位理論上只有 3 種狀態，但 `nunique()` 顯示有 12 種，通常代表需要標準化。
### 檢查缺值

```python
missing_count = df.isna().sum()
```

`isna().sum()` 可以看每個欄位缺幾筆。

### 檢查數值欄位

```python
df.describe()
df["amount"].describe()
df["amount"].sort_values().head()
df["amount"].sort_values().tail()
```

`describe()` 可以快速看平均值、標準差、分位數、最大最小值。這個階段要找的是不合理或不可能的值，例如：

- 年齡小於 0 或大於 150
- 金額為負數，但業務上不允許
- 百分比大於 100
- 數值欄位出現極端離群值

## Clean：依問題類型清理資料

我會把 Clean 分成四種思維：

1. consistency：統一欄位與結構
2. fixing corruption：修正明顯壞掉的資料
3. filling gaps：處理缺值
4. value standardization：標準化欄位值

### Consistency：先整理欄位名稱與索引

欄位名稱如果不一致，後續操作會很痛苦。常見做法是統一成 `snake_case`：

```python
df.columns = (
    df.columns
      .str.strip()
      .str.lower()
      .str.replace(" ", "_", regex=False)
)
```

如果欄位名稱有括號、百分比符號或其他特殊字元，也可以進一步處理：

```python
df.columns = (
    df.columns
      .str.strip()
      .str.lower()
      .str.replace(r"[^0-9a-zA-Z_]+", "_", regex=True)
      .str.strip("_")
)
```

關於 index，我以前會記成「id should be index」，但更精準的說法是：如果某個 ID 是穩定、唯一、且常被用來定位資料列的識別欄位，可以考慮設成 index。

```python
df = df.set_index("customer_id", drop=False)
```

但不是所有 ID 都適合設成 index。若這個欄位常用於 join、輸出或被其他工具讀取，保留成一般欄位反而比較方便。

### Fixing corruption：修正欄位型別與壞掉的值

很多資料清洗問題其實是型別問題。例如金額欄位看起來是數字，但因為有 `$`、`,` 或空字串，被 pandas 讀成 `object`。

```python
df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
```

這裡我會偏好 `pd.to_numeric(..., errors="coerce")`，而不是直接 `astype(float)`。因為 `astype(float)` 遇到無法轉換的值會直接噴錯；`to_numeric` 可以先把轉換失敗的值變成 `NaN`，再回頭檢查哪些資料壞掉。

```python
bad_amount_rows = df[df["amount"].isna()]
```

日期欄位也類似：

```python
df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
```

### Filling gaps：處理缺值

缺值處理常見工具是 `dropna()` 和 `fillna()`，但不能只靠函式決定策略。

如果某些欄位是分析或建模必需欄位，缺了就沒有意義，可以考慮刪掉：

```python
df = df.dropna(subset=["customer_id", "created_at"])
```

如果缺值可以用明確規則補上，可以使用 `fillna()`：

```python
df["status"] = df["status"].fillna("unknown")
df["quantity"] = df["quantity"].fillna(0)
```

但補值要小心。把缺失金額補成 0，代表「真的沒有金額」；如果實際意思是「不知道金額」，補 0 會改變資料意義。

時間序列資料常會用前一筆或後一筆補值：

```python
df["temperature"] = df["temperature"].ffill()
```

但這也需要前提：資料必須先依時間排序，而且相鄰觀測值之間真的有延續性。

```python
df = df.sort_values("measured_at")
df["temperature"] = df["temperature"].ffill()
```


### Value standardization：標準化欄位值

資料清洗最後常會處理值的標準化。

常見問題是 compound column，也就是一個欄位裡塞了多種資訊。例如 `name` 裡同時有姓和名，或 `location` 裡同時有城市和國家。

```python
df[["city", "country"]] = df["location"].str.split(",", n=1, expand=True)
```

## Review：檢查清理結果

Review 是很多人會省略的一步，但它其實是資料清洗最重要的保險。

清理完後，我通常會重新跑一次 Inspect 階段的檢查：

```python
df.info()
df.isna().mean().sort_values(ascending=False)
df.duplicated().sum()
df.describe()
```

也會檢查清理前後的筆數變化：

```python
len(raw_df), len(df)
```

如果刪掉很多資料，要能說明原因：

```python
rows_removed = len(raw_df) - len(df)
removed_ratio = rows_removed / len(raw_df)
```

對類別欄位，清理後應該再看一次：

```python
df["status"].value_counts(dropna=False)
```

對數值欄位，則要確認範圍是否合理：

```python
df["amount"].min()
df["amount"].max()
df["amount"].describe()
```

## Export：輸出乾淨資料

```python
df.to_csv("clean_data.csv", index=False)
```


## 容易搞混的 pandas indexing

1. iloc
   - 用整數位置選資料
   - 可以讀取，也可以改值

2. loc
   - 用 index / column label 選資料
   - 可以吃 boolean mask
   - 可以讀取，也可以改值
   - 最常用、功能最完整

1. df\[condition\]
   - 主要用來篩選列、不能修改值，要修改值時改用 loc

## References

- [I Cleaned a Messy CSV File Using Pandas. Here's the Exact Process I Follow Every Time](https://towardsdatascience.com/i-cleaned-a-messy-csv-file-using-pandas-heres-the-exact-process-i-follow-every-time/?utm_source=roadmap&utm_medium=Referral&utm_campaign=TDS+roadmap+integration)
- [pandas documentation: Indexing and selecting data](https://pandas.pydata.org/pandas-docs/stable/user_guide/indexing.html)
- [pandas documentation: Working with missing data](https://pandas.pydata.org/docs/user_guide/missing_data.html)
- [pandas documentation: DataFrame.duplicated](https://pandas.pydata.org/pandas-docs/stable/reference/api/pandas.DataFrame.duplicated.html)
- [pandas documentation: DataFrame.drop_duplicates](https://pandas.pydata.org/pandas-docs/stable/reference/api/pandas.DataFrame.drop_duplicates.html)
