---
publish: true
tags:
date:
---
`nullable<T>`一定要是value type，reference type本來就可以為null，optional string只是增加編譯時期的檢查。

## **定義範例**
```csharp
public struct Nullable<T> where T : struct
{
    public bool HasValue { get; }
    public T Value { get; }
}

```

## 正確取值的方式

假設Level是一個`nullable<T>`，正確取值的做法

```csharp
if (Level.HasValue)
    result = Level.Value;
```

等價於條件運算式：

```csharp
result = Level.HasValue ? Level.Value : result;
```

用null合併運算子可以再簡化成：

```csharp
result = Level ?? result;
// 如果Level有值，就取Level.Value
// 如果Level沒有值，就執行result
```

`??` 背後的行為 = 自動幫你判斷 `HasValue` 並取出 `.Value`