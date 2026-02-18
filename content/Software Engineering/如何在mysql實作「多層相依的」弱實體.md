---
title: 如何在mysql實作「多層相依的」弱實體
publish: true
tags:
  - SQL
date: 2025-03-28
---

假設一個情境是User有很多Project，但Project是弱實體，不能沒有User而單獨存在。

在sql中實作弱實體有兩種主流方法：

## 方法一

把弱實體的主鍵改成複合主鍵，一個是指向Parent entity的外鍵，另一個是弱實體自己的部分鍵(partial key)。

```sql
CREATE TABLE User (
 user_id INT PRIMARY KEY,
 -- 其他欄位
);

CREATE TABLE Project (
 project_id INT, -- 弱實體自己的partial key
 user_id INT FOREIGN KEY, -- 指向Parent entity的外鍵
 -- 其他欄位
 PRIMARY KEY (user_id, project_id) -- 複合主鍵
);
```

## 方法二

維持弱實體有自己的主鍵，但是在指向Parent entity的外鍵加上NOT NULL和ON DELETE CASCADE，這樣也能確保這個弱實體在Parent entity被刪除後不會單獨存在。

```sql
CREATE TABLE User (
 user_id INT PRIMARY KEY,
 -- 其他欄位
);

CREATE TABLE Project (
 project_id INT PRIMARY KEY, -- 弱實體有自己的主鍵
 user_id INT NOT NULL, -- 外鍵加上NOT NULL
 -- 其他欄位
 FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE -- 外鍵加上ON DELETE CASCADE
);
```

第一個方法比較符合ER-diagram的嚴格語意，他表達了弱實體必須依附Parent entity的設計思想。

第二個方法可以簡化資料庫的操作和查詢，因為只需要有project_id就可以單獨識別，不需要有Parent entity才能識別弱實體，但是一定要確保外鍵約束正確，不然弱實體可能會脫離parent entity存在。

## 但是如果情境是「多層相依的」弱實體呢？

什麼意思？也就是如果剛才的User有很多Project，而Project是弱實體。如果Project又有Note，Note也是弱實體，不能沒有Project存在。畫成圖就是：User → Project → Note。

這時候第一個方法就會開始變得冗長了，Note的複合主鍵要包含指向Grandparent entity的外鍵, parent entity的外鍵和自己的partial key。

當這個弱實體的外鍵由三個構成，代表查詢時都要同時擁有這三個資訊才能唯一識別一個弱實體的資料列，這會讓應用程式開發開始變得複雜。

這時候雖然方法二不符合ER-diagram的嚴格語意，但在實務上是比較簡單的做法，這時候一個好的做法就是放棄用複合主鍵，改讓每個弱實體都有自己的主鍵。
