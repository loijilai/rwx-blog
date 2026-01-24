---
publish: true
tags:
  - Api-design
date:
comments: true
---
這篇文章是我用AI整理，重寫了我與AI關於 GraphQL 的問題與討論，目標讀者是剛開始接觸 GraphQL 的開發者。文章不從規格或名詞出發，而是從實際開發時「你一定會遇到的問題」切入。

---

## 一、GraphQL 回傳的到底是什麼？為什麼不是 Array？

許多第一次接觸 GraphQL 的工程師，常會卡在一個直覺問題：為什麼不能像 REST 一樣，直接回傳一個 JSON array？例如查詢使用者清單時，直覺會希望 API 回傳 `[{...}, {...}]`。

在 REST 中，你可能會這樣設計：

```http
GET /users
```

```json
[
  { "id": "1", "name": "Alice" },
  { "id": "2", "name": "Bob" }
]
```

但在 GraphQL 中，這樣的回傳是**不合法的**。GraphQL 規範要求 response 的最外層一定是 object，因為它需要同時承載 `data`、`errors` 等資訊。

正確的 GraphQL 寫法會是：

```graphql
query {
  users {
    id
    name
  }
}
```

```json
{
  "data": {
    "users": [
      { "id": "1", "name": "Alice" },
      { "id": "2", "name": "Bob" }
    ]
  }
}
```

這代表你不是在「呼叫一個回傳 array 的 API」，而是在「查詢一個 object，而這個 object 裡的某個欄位是 array」。這個心智模型會影響你之後對錯誤處理與快取的理解。

---

## 二、Enum 與 Union 的差別：不要把值和型別混在一起

在設計 GraphQL schema 時，Enum 和 Union 都看起來像是在處理「多選一」，但它們解決的是完全不同層級的問題。

先看 Enum。Enum 用來表示「一個值有哪些合法選項」，例如訂單狀態：

```graphql
enum OrderStatus {
  PENDING
  PAID
  CANCELED
}

type Order {
  id: ID!
  status: OrderStatus! // 永遠只會是一個值
}
```

這裡的 `status` 永遠只會是一個值，client 不能對它再查詢欄位。

再看 Union。Union 用來表示「這個欄位回傳的物件型別不確定」：

```graphql
union SearchResult = User | Organization // 回傳的物件型別不確定

type Query {
  search(keyword: String!): [SearchResult!]!
}
```

```graphql
query {
  search(keyword: "acme") {
    __typename
    ... on User {
      name
    }
    ... on Organization {
      legalName
    }
  }
}
```

如果你試圖用 Enum 來模擬這種情境，例如加一個 `type` 欄位再配多個 nullable 欄位，會讓 client 必須自己猜資料結構，這正是 GraphQL 想避免的事情。

---

## 三、為什麼 GraphQL 需要 Aliases？

假設你在同一個畫面中，需要同時顯示兩個使用者的資料。如果你這樣寫：

```graphql
query {
  user(id: 1) {
    name
  }
  user(id: 2) {
    name
  }
}
```

這個 query 是不合法的，因為 response 會出現重複的 key。

GraphQL 的解法是使用 alias：

```graphql
query {
  leftUser: user(id: 1) {
    name
  }
  rightUser: user(id: 2) {
    name
  }
}
```

```json
{
  "data": {
    "leftUser": { "name": "Alice" }, // key1: leftUser
    "rightUser": { "name": "Bob" } // key2: rightUser，這樣就不會重複
  }
}
```

Alias 讓你在不改 schema 的情況下，為 response 定義清楚且不衝突的結構，這在比較畫面或 dashboard 類型的 UI 中非常常見。

---

## 四、Variables：為什麼不能用字串拼 Query？

在學 GraphQL 的時候，會有一個自然的疑問：「既然 Query 本質上就是一段字串，為什麼不能在前端直接用字串拼出我要的 Query？」

**一個看起來沒問題的 Query**

假設你有這樣一個 GraphQL Query：

```
query {
  hero(episode: JEDI) {
    name
  }
}

```

這個 Query 的意思很單純：
取得在  `JEDI`  這一集出現的主角名字。

如果需求永遠固定，這樣寫完全沒問題。但實際的產品幾乎不可能這麼單純。

**真正的情境：資料來自使用者**

在前端畫面上，使用者可能會選擇不同的集數，例如 `NEWHOPE`、`EMPIRE` 或 `JEDI`。 這代表 `episode` 不是寫死的，而是來自使用者操作。

最天真的直覺會這樣做：用 JavaScript 字串把 Query 拼出來。

```js
const episode = "JEDI";

const query = `
  query {
    hero(episode: ${episode}) {
      name
    }
  }
`;
```

這種寫法在一開始看起來可以運作，但很快就會變得難以控制。 隨著參數變多，你會開始處理引號、型別、條件判斷，Query 不再只是「描述資料」，而變成「被動態組裝的字串」。

這正是 GraphQL 想要避免的事情。

**GraphQL 正確的做法：使用 Variables**

GraphQL 提供了 variables，讓你可以把「Query 結構」和「實際資料」分開。

```graphql
query Hero($episode: Episode!) {
  # 注意$episode前面的$
  hero(episode: $episode) {
    name
  }
}
```

Query 本身是固定的，它只描述你「要什麼資料」。
真正會變動的值，透過 variables 在執行時傳入。

```json
{
  "episode": "JEDI"
}
```

每次呼叫時你只需要換 variables，Query 本身完全不需要改。

## 五、Fragments：當查詢開始重複時，你已經需要它了

在實務中，一個頁面往往不只一個地方需要顯示角色資訊。例如，假設你的頁面上有兩個地方都要顯示角色資訊：

- 左邊：主角卡片
- 右邊：推薦角色卡片

兩者都需要角色的名字(name)與朋友清單(friends)。這時如果不使用 fragment，很容易在不同的 Query 裡重複寫同樣的欄位：

```graphql
hero {
  name
  friends {
    name
  }
}
```

一開始看起來只是多寫幾行，但隨著需求改變，問題會逐漸浮現。**當角色需要多顯示一個欄位，或朋友清單的結構改變時，你必須同時修改所有重複出現的 Query**，只要漏掉一個地方，就可能導致畫面或資料不一致。

Fragment 的目的，就是把這組「會重複出現的資料需求」集中定義在一個地方。你可以替這組欄位取一個名字，例如：

```graphql
fragment CharacterBasic on Character {
  name
  friends {
    name
  }
}
```

這段 fragment 的意思是：在 `Character` 這個型別上，有一組常用的欄位集合，叫做 `CharacterBasic`。當你真正撰寫 Query 時，只需要引用它即可：

```graphql
query {
  hero(episode: EMPIRE) {
    ...CharacterBasic
  }
}
```

GraphQL 在執行時會自動將 fragment 展開成實際的欄位，因此功能上等同於直接寫完整欄位，但**維護上只需要改一個地方**。

### 新手疑問
> 為什麼 fragment 一定要寫 `on Type`？fragment 不就是把欄位抽出來重用嗎？

假設有這個 fragment：

```graphql
fragment previewInfo on Email {
  subject
  bodyPreview
}
```

為什麼一定要寫 `on Email`？

### 原因
因為 GraphQL 是強型別系統：

- fragment 只能套用在「某一種節點型別」
- 如果現在拿到的是 Sms、Notification，就不一定有這些欄位

### 重點
fragment 不是單純文字替換，而是：

> 「當目前節點是這個型別時，才合法展開的子結構」

## 六、Inline Fragments 與 \_\_typename：處理不確定型別的必要工具

在 GraphQL 中，當你查詢的是 Interface 或 Union 型別時，代表後端只保證會回傳「某一種類型的資料」，但不保證實際是哪一個具體型別。例如以下 Query：

```graphql
hero(episode: Episode!): Character
```

這表示回傳結果一定符合 `Character` 介面，但它可能是 `Human`，也可能是 `Droid`。因此，**你只能直接存取 `Character` 介面明確保證存在的欄位**，像是 `name`，而不能假設回傳結果一定具有某個具體型別才有的欄位。

當你需要依據實際型別，取得 `Human` 或 `Droid` 各自專屬的欄位時，就必須使用 inline fragment。inline fragment 的語意是「只有在回傳結果屬於某個型別時，才套用這段欄位定義」：

```graphql
query HeroForEpisode($ep: Episode!) {
  hero(episode: $ep) {
    name
    ... on Droid {
      primaryFunction
    }
    ... on Human {
      height
    }
  }
}
```

在這個 Query 中，`name` 一定會被回傳，而 `primaryFunction` 或 `height` 則只會在實際型別符合時才出現。**GraphQL 會在執行階段自動判斷實際型別，確保不會回傳不合法的欄位**。

在 client 端，通常會搭配 `__typename` 來判斷目前回傳的是哪一種型別。`__typename` 是 GraphQL 內建欄位，會回傳實際型別名稱：

```graphql
{
  search(text: "an") {
    __typename
    ... on Human {
      name
    }
    ... on Droid {
      name
    }
  }
}
```

透過 `__typename`，前端可以安全地依據型別分支處理資料與 UI，而不需要猜測資料結構。**這在同一個列表中渲染不同 UI，或在使用快取系統正確識別資料時，都是不可或缺的工具**。

## 七、Directives：動態改變查詢結構，而不是拼字串

假設你的畫面有「摘要模式」與「詳細模式」，你可能只在詳細模式才需要朋友清單。

使用 directive 的寫法如下：

```graphql
query Hero($withFriends: Boolean!) {
  hero {
    name
    friends @include(if: $withFriends) {
      name
    }
  }
}
```

```json
{ "withFriends": false }
```

當 `withFriends` 為 `false` 時，`friends` 欄位完全不會被執行。這讓你不需要在前端動態拼 query，而是用變數正式地控制查詢結構。

# 下一篇

下一篇會介紹GraphQL 常見的 N+1問題：[[GraphQL 的「Graph」到底是什麼？為什麼會有 N+1 問題？]]