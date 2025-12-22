---
publish: false
tags:
date:
comments: true
---
每個schema有兩種必要的type
1. Query: 查資料
2. Mutation: 修改資料

Type: Response model
Input: Request body (可以傳入什麼參數)

在C#中，通常會用hot chocolate
1. Query root: 寫class Query，裡面加上resolver(就是method)，注意只能return object
2. 在program.cs加入，這些就是可以用的graphql query