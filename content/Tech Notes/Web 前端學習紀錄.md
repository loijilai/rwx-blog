---
publish: true
tags:
date:
---
## 介紹

1. 動機  
   畢業後終於不用做無聊的研究了，因為過去一直想做app幫自己解決小問題，趁著找工作前的空檔學一下前端，順便記錄過程的學習。
2. 成果  
	做了一個很陽春的react app，幫助我記錄BMAA的練習。但其實不太好用XD。學到比較多的反而是摸索自己學習方法的過程，也就是我這篇紀錄的。
3. 時間  
   2025的7月和8月

## Bottom-up的學習模式

我最近在思考學習寫程式，過去都是從書本、課堂、線上課開始，也就是由基礎到做專案這種”bottom-up”的線性學習路徑。但我發現這種學習方式非常不適合我，原因是：

1. 上線上課時，我常常淹沒在大量資訊中，不知道重點是什麼，最後都記不太起來，原因是在我遇到真正的問題前，所有的資訊似乎都沒辦法在我頭腦裡留下印象
2. 這些學習路徑雖然每個階段都劃分清楚，像是先學會某個技術、再進入下一個技術，但是心中缺乏一個大的地圖，導致很容易在每個階段停留過久，甚至迷失在細節裡

核心問題：我在接觸這些資訊時，我連要解決什麼問題都不知道。

## Top-down的學習模式

於是我調整策略，發現直接從做中學，也就是”top-down”的學習路徑比較適合我，這種方式就是直接做自己想要做出的軟體，然後在中間補齊需要用到的知識。

然而結果卻沒有想像中好，更像是直接撞上一個很高的峭壁，原因是：

1. 我常常「不知道自己不知道什麼」，導致在搜尋觀念時很不精準，浪費很多時間
2. 問AI、看blog得到解法，但是很難衡量每種解法背後的設計考量，也不知道背後有什麼更大的觀念要建立，導致自己只是在拼湊各種解法

用這個方法的結果是，我確實把東西做出來了，大概知道每個技術之間的關係是什麼，但總覺得觀念不太清楚，就只是讓東西停留在「可以跑」這個階段。

## 最佳的學習模式：Guided top-down

後來我調整最適合我的學習方式，我稱作是”Guided top-down”，大意還是直接從做中學，但是為了真正學習背後的深層觀念，而非只是在拼湊各種解法，我需要大量、微小、具體的範例去引導我的觀念。

具體的做法是去找「已經有完整程式碼的專案」來做，甚至是已經有影片的教學。但為了避免自己又陷入”bottom-up”學習的陷阱，就是停留在看而不會做的階段，所以我先不看影片直接開始做，卡關的時候才看影片，這種方式是讓有經驗的人告訴我過程中要考量的點是什麼，才知道為什麼他程式碼是這樣寫出來的。

有了學習的大方向後，我花一些時間對每個技能，去找尋已經有解答的專案來做，以下會分享我在學習時用到的資源。

## HTML & CSS

這部分我沒有特別去看html跟CSS的課程，都是需要用到再查。

我是用[Frontend Mentor | Getting started on Frontend Mentor](https://www.frontendmentor.io/learning-paths/getting-started-on-frontend-mentor-XJhRWRREZd/steps/688dcca5fe7173b9c8e349a6/article/read)，我只做了第一個learning path，並且參考了

1. https://youtu.be/84OJZ3U9imw?feature=shared
2. https://youtu.be/OAapSUYcoqE?feature=shared
3. https://youtu.be/av6JRW2lCWE?feature=shared
4. https://youtu.be/N-r70Nvo0C0?feature=shared

做完這四個挑戰，大致上最簡單的HTML&CSS就沒問題了，像是spacing, styling, BEM naming等等，我先放掉layout (grid & flex), responsive design, accessibility，我覺得這些等到要用到再回來學就好。

如果之後需要練習layout和responsive design，我可能會做這兩個練習：

1. https://youtu.be/h4dHvo09cG4?feature=shared
2. https://youtu.be/Thudicbgqtg?feature=shared

## Javascript

javascript的部分我是看這份文件：[The Modern JavaScript Tutorial](https://javascript.info/)

但這份文件因為資訊量太大了，很容易又迷失在細節裡，於是我只看了promise和function這兩章，其他一樣要用到再查就好。

然後這部分可以直接做一個todo list，我主要是參考 https://github.com/abdellatif-laghjaj/todo-list ，但我覺得他寫的還是有點複雜，後來自己想一些額外的功能做一版很陽春的todo list，主要是練習DOM manipulation。

做完一個會用到HTML + javascript的專案，確保自己大概懂DOM manipulation後，就開始學React了。

## React

React的學習我是照著這份做 https://react.dev/learn/tutorial-tic-tac-toe 還有 https://react.dev/learn/thinking-in-react。

大概會react後，就把剛才的todo list重新用react寫一次，了解react state management到底在幫我做什麼。

## Typescript

因為越來越多專案都是用typescript，我是先看 https://youtu.be/BCg4U1FzODs?feature=shared。

然後接著再做[Learn React With This ONE Project (youtube.com)](https://www.youtube.com/watch?v=G6D9cBaLViA&t=183s&ab_channel=TechWithTim)，然後用typescript寫，這樣可以順便練習react + typescript。這個專案可以複習到前面學過的所有東西，也會需要用到CSS grid，是很好的複習機會。

## 後端

後端後來改用python，所以這邊只是放一些資源

Node.js + Express.js

https://www.youtube.com/watch?v=32M1al-Y6Ag&ab_channel=TraversyMedia

[Express Crash Course (youtube.com)](https://www.youtube.com/watch?v=CnH3kAXSrmU&ab_channel=TraversyMedia)

[Node.js — Introduction to Node.js (nodejs.org)](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs)

前端可補TailwindCSS

PERN stack [PERN Stack Course: Build a Product Store with Postgres & React (youtube.com)](https://www.youtube.com/watch?v=lx3YJj0nJVk&ab_channel=Codesistency)

Traversary media: MERN stack

## 後記

我覺得很像是在學習怎麼爬一座高山，一開始想要直直走上去，但卻直接撞壁，後來學會辨識地形、拆解技能，用中途學到的東西幫助自己爬上更高一層。

我甚至覺得就算這些技術全部都過時，這個過程還是很有價值，因為重點就在於學會如何自學這件事上。

在過程中會懷疑自己是不是學太慢了，但有很多資源可以提醒我能夠怎麼調整。像是[How To Learn A New Programming Language (youtube.com)](https://www.youtube.com/watch?v=E8cM12jRH7k))提到的方式：documentation/advent of code → websocket server (socket, std lib, 3rd library, async) → Larger patterns and scales (interpreter)。

一開始什麼都不會很煩躁，但值得鼓勵的是，當自己能力成長，解決問題的方法也變多了，反而是一開始什麼都不懂時poke around的焦躁是最痛苦的，如果實力真的有提升，其實也沒有越學越痛苦的感覺，反而會因為進步而看到新的風景感到雀躍，就像是爬山一樣。

回想自己小時候學除法是痛苦的，但隨著能力增長就覺得沒這麼複雜了，正如同如今還是有很多複雜的東西要學習，但當學會之後又沒有一開始想得這麼困難。