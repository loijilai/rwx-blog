---
publish: true
tags:
  - system-design
date:
comments: true
---
1. Cache Replacement指的是當Cache滿時，要用什麼policy選出要踢出的資料
2. Cache Invalidation Strategy確保Cache中的資料是正確的，當失效時要把資料invalidate
   ![[Cache-Invalidation.jpg]]

3. Cache Invalidation Method

https://www.designgurus.io/blog/caching-system-design-interview?gad_source=1&gad_campaignid=23163907085&gbraid=0AAAAADME9yo_5sH9rsilGX_NmmO9TRHq5&gclid=Cj0KCQiAubrJBhCbARIsAHIdxD8IYYOlKmhnlfZ5d7J96BEK3qcOLxppyEGq1uiSS3ApXtwJJ8NwpfQaAlL4EALw_wcB