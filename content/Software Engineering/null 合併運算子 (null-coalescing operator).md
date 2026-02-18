---
publish: true
tags:
  - csharp
date:
---
在 C# 中，`Nullable<T>` 只能用在 value type 上，因為 value type 本身不能為 null。

而reference type 天生就可以是 null；所謂的 nullable reference type（例如 `string?`）只是增加編譯期的檢查，並不改變執行期行為。

## **定義範例**
`Nullable<T>` 的概念其實很單純，它內部包含兩個核心成員：`HasValue` 用來表示是否有值，`Value` 則是在確定有值時才可存取。
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

## null-coalescing assignment operator

除了 `??` 之外，C# 還提供了 `??=`，也就是 null-coalescing assignment operator。它的用途與前者不同，主要用在補預設值的情境。例如：

```csharp
foo ??= defaultValue;
```

這代表只有在 `foo` 為 null 時，才會將 `defaultValue` 指派給它；若 `foo` 已經有值，則完全不會改動。無論是 `??` 或 `??=`，判斷的都是左側的變數是否為 null，只是前者回傳結果，後者則在需要時進行指派。