---
publish: false
tags:
date:
comments: true
---
還沒有實際用過，不太知道什麼時候會用

有兩個步驟

1. 先定義一個Error class，至少要能夠放Error code, Error message
2. 再定義一個Result class，要能夠表示成功/失敗，成功就可以從中取資料，失敗就可以從中取Error class

為什麼要用Result pattern不用exception？
因為exception適合同一個process內部，跨服務的錯誤沒辦法throw回前端。