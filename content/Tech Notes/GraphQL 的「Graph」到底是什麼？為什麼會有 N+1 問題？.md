---
publish: true
tags:
date:
comments: true
---
對剛接觸 GraphQL 的 Developer 來說，最常出現的困惑之一是：GraphQL 名字裡的「Graph」到底代表什麼？為什麼只要寫幾層巢狀查詢，效能就突然變得很差，甚至出現所謂的 N+1 問題？

這篇文章會用你在實際開發 API 時一定會遇到的情境，一步一步說清楚 GraphQL 的 Graph 概念，以及 N+1 問題為什麼會發生。

## GraphQL 的 Graph 是什麼意思？

GraphQL 的 Graph，並不是在講資料視覺化的那種圖表，而是在描述資料之間的關係結構。在 GraphQL 的世界中，每一筆資料都可以被想成一個節點（Node），而節點與節點之間的關聯，就是一條一條的關係（Edge）。

當你在設計 GraphQL Schema 時，其實就是在描述一張資料關係圖。使用者不再只能呼叫固定格式的 API，而是可以沿著這張關係圖，從一個節點一路走到其他相關的節點。

舉一個後端開發中很常見的例子來看：

User 下面會有多篇 Post，而每一篇 Post 又會有多則 Comment，每個 Comment 又會對應到一個 Author。這些資料之間，本來在資料庫裡就是透過外鍵關聯在一起的。

在 REST API 中，你可能會設計多支 endpoint，例如先拿使用者，再用使用者 ID 去打另一支 API 拿文章，最後再打第三支 API 拿留言。GraphQL 則是把這些步驟，整合成一次查詢。

GraphQL 只是把這種關係，用 API 的形式暴露出來，讓前端可以依照實際需求，決定要走到關係圖的哪一層。

例如，你可以寫出這樣的查詢：

```
query {
  user {
    posts {
      comments {
        author {
          name
        }
      }
    }
  }
}
```

這段查詢的意思是：從 user 開始，沿著資料關係，一路拿到 posts、comments，最後拿到 comment 作者的 name。GraphQL Server 會依照 Schema 與 resolver 的定義，幫你把這些資料組合成一個回傳結果。

這種能力對前端來說非常方便，但對後端來說，如果沒有理解 GraphQL 的執行模型，很容易在這裡踩到效能地雷。

## N+1 問題是怎麼產生的？

我們直接用前面那個查詢來看，N+1 問題是如何一步一步出現的：

```
query {
  user {
    posts {
      comments {
        author {
          name
        }
      }
    }
  }
}
```

我在實作 resolver 時，會很直覺地讓「每一個欄位的 resolver，自己負責把資料查出來」。從功能上來說這樣完全正確，但效能問題正是從這裡開始累積。

GraphQL 在執行這個查詢時，實際順序會是先解析 user，接著解析 user 底下的 posts，再解析每一篇 post 底下的 comments，最後才是每一個 comment 的 author。

## 用 pseudo code 看 naive resolver 是怎麼寫出 N+1 的

如果把剛剛那個 query 對應到實際後端程式碼，很多人在第一次寫 GraphQL resolver 時，會自然地寫出類似下面這樣的結構。這裡不是特定語言，而是刻意用接近白話的 pseudo code，幫助理解執行行為。

```
Query.user = () => {
  return db.findUser()
}

User.posts = (user) => {
  return db.findPostsByUserId(user.id)
}

Post.comments = (post) => {
  return db.findCommentsByPostId(post.id)
}

Comment.author = (comment) => {
  return db.findUserById(comment.authorId)
}
```

單看每一個 resolver，都沒有任何問題，也完全符合直覺。但當 GraphQL 執行下面這個查詢時：

```
query {
  user {
    posts {
      comments {
        author {
          name
        }
      }
    }
  }
}
```

GraphQL 會先呼叫一次 `Query.user`，查一次資料庫取得使用者；接著呼叫一次 `User.posts`，再查一次資料庫取得這個 user 的所有文章；假設這個使用者有 N 篇文章，接下來在對每一篇 post 各自呼叫 `Post.comments`，變成 N 次查詢；最後再對每一則 comment 各自呼叫 `Comment.author`，如果總共有 M 則 comment，就會再產生 M 次查詢。

從 request 的角度來看，你只送出了一個 GraphQL 查詢；但從後端實際執行來看，卻變成 1 次查 user、1 次查 posts、N 次查 comments、M 次查 author。這種「第一層查一次，下一層對每筆資料各自再查一次」的模式，就是 GraphQL 中最典型的 N+1 問題。
## 為什麼這不是 GraphQL 本身的錯？

很多人第一次遇到 N+1 問題時，會直覺認為是 GraphQL 設計不良。但實際上，GraphQL 只是鼓勵你「沿著資料關係走」，真正造成問題的，是 resolver 實作方式沒有考慮到效能。

GraphQL 的執行模型是以欄位為單位，一層一層展開並解析。只要某一層的 resolver 裡面直接做即時查詢，而且沒有任何合併或快取機制，就很容易在巢狀結構中產生大量重複查詢。

換句話說，GraphQL 把資料關係的彈性開放給你，同時也把效能管理的責任交回給後端開發者。

## 為什麼 DataLoader 會變成 GraphQL 的核心工具？

為了解決這類問題，GraphQL 生態系中幾乎一定會搭配使用 DataLoader。DataLoader 的目的，不是幫你改寫 GraphQL，而是修正在「走 graph」時容易出現的效能問題。

在一次 GraphQL request 的生命週期中，DataLoader 會先把所有相同型態的資料請求收集起來，等到同一輪 resolver 執行結束前，再合併成一次 batch 查詢送到資料庫。查詢結果會被暫存在 request scope 的快取中，讓同一個 request 裡重複需要的資料，不會被查第二次。

## 同一個 query，用 DataLoader 後查詢次數怎麼改變？

我們還是用完全一樣的 query，不改任何 GraphQL 查詢內容：

```
query {
  user {
    posts {
      comments {
        author {
          name
        }
      }
    }
  }
}
```

差別只在 resolver 的實作方式。為了讓這段更好理解，我們先把「context」和 DataLoader 在做什麼，用實際流程一步一步拆開來看。

在 GraphQL Server 中，每一次 request 都會建立一個「request 專用的 context」。你可以把 context 想成是這次請求的共用工具箱，裡面會放資料庫連線、登入使用者資訊，以及我們要用的 DataLoader。

實務上，context 通常會在 request 一開始就被建立好，大概概念會像這樣：

```
context = {
  userLoader: new DataLoader(batchLoadUsers)
}
```

這代表在「同一個 GraphQL query 執行期間」，所有 resolver 都會拿到同一個 `context`，也就共用同一個 `userLoader`。

接下來再回到這個 resolver：

```
Comment.author = (comment, context) => {
  return context.userLoader.load(comment.authorId)
}
```

這裡發生的事情，和 naive resolver 最大的不同在於：它沒有立刻去查資料庫。

假設這個 query 解析後，一共會處理三則 comment，它們的 `authorId` 分別是 1、2、1。GraphQL 在解析 comments 時，會依序呼叫三次 `Comment.author` resolver。

第一次呼叫時，resolver 只是跟 DataLoader 說：「我需要 authorId = 1 的使用者」；第二次呼叫時，又登記了 authorId = 2；第三次呼叫時，再次登記 authorId = 1。到目前為止，資料庫其實一次都還沒被查詢。

等到這一輪 resolver 都執行完，DataLoader 才會把剛剛收集到的 id 去重後，整理成一份清單，例如 `[1, 2]`，然後只送出一次資料庫查詢，概念上會像：

```
SELECT * FROM users WHERE id IN (1, 2)
```

資料回來之後，DataLoader 會依照 id，把正確的 user 資料對應回原本那三次 `load` 呼叫，讓每一個 comment 都拿到對應的 author。

因此，原本 naive resolver 中「每一則 comment 就查一次 author」的行為，現在被改成「在同一個 request 裡，所有 comment 的 author 一起查完」。對外來看，你的 GraphQL query 完全沒有任何改變；但對內來看，資料庫查詢次數已經從 M 次，變成 1 次。

這也是為什麼會說 DataLoader 是 GraphQL 實務開發中，幾乎不可或缺的基礎工具。

## 小結

GraphQL 的 Graph，代表的是資料之間可以被自由遍歷的關係結構。這種設計讓 API 使用上非常彈性，但也讓後端更容易在不知不覺中製造出 N+1 問題。理解 GraphQL 的執行方式，並搭配像 DataLoader 這樣的工具，才能在享受 GraphQL 帶來的便利同時，維持系統的效能與穩定性。