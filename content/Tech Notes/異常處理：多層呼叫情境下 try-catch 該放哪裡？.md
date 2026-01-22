---
publish: true
tags:
date: 2026-01-22
---
## 前言

在實務開發中，`try-catch` 最常被問的不是語法怎麼寫，而是「一段流程有好幾層呼叫，到底要 catch 幾次？」有些人習慣在每個方法都包一層，理由是「比較安全」。但這種寫法最後通常會導致兩個問題：第一，錯誤被重複紀錄，log 變得又吵又難查；第二，更嚴重的是錯誤被吃掉，系統表面上正常，實際上資料漏寫或流程半套完成。

這篇文章的重點不在於介紹 `try-catch` 的語法，而是針對「多層呼叫」這種最常見的後端情境，建立一套清楚的異常處理分工。你會看到什麼情況應該讓例外往上拋，什麼情況需要在內層就攔住，以及每一層攔住例外時應該採取什麼策略。

---

## 貼近實務的例子：核心步驟 + 非核心步驟的call chain

以下我們用一個典型的「下單」流程作例子。這類流程幾乎存在於所有系統：電商、票券、訂房、訂閱制服務都類似。

假設你有一個 API：`POST /orders`。當使用者下單時，你需要做三件事：

第一，將訂單寫入資料庫；第二，向第三方金流服務請款；第三，寄出確認信。這三件事的重要性不同：

寫入資料庫屬於核心交易，失敗等同整筆訂單不存在；請款是核心流程的一部分，失敗必須讓下單失敗；寄信則是附加功能，失敗不應阻止訂單成立。

這種「核心步驟 + 非核心步驟」混在同一條 call chain 的情況，最考驗 try-catch 的放置位置。

---

## 外層 try-catch：系統邊界負責「統一收斂」

外層通常是 Controller 或 Handler。它的責任不是處理每一種錯誤，而是把未知的例外「收斂」成一致的 API 行為，例如回傳 `500`，同時記錄必要的 request context。

在邊界層包 try-catch 的核心原因是：

當 exception 沒被處理、一路往上拋到框架時，框架雖然會回 500，但你往往會失去足夠的上下文（例如 userId、orderId、payload），或是 log 格式不一致，難以在 ELK 追查。

因此邊界層的 try-catch 不是為了「避免錯誤」，而是為了「讓錯誤可觀測、可統計、可定位」。

範例：

```csharp
[HttpPost("/orders")]
public async Task<IActionResult> CreateOrder(CreateOrderRequest request)
{
    try
    {
        var orderId = await _orderService.CreateOrderAsync(request);
        return Ok(new { OrderId = orderId });
    }
    catch (BusinessException ex)
    {
        // 已知的業務錯誤：例如庫存不足、金流拒絕
        _logger.LogWarning(ex, "CreateOrder failed: {UserId}", request.UserId);
        return BadRequest(new { Message = ex.Message });
    }
    catch (Exception ex)
    {
        // 未知錯誤：統一記錄上下文與回 500
        _logger.LogError(ex, "CreateOrder unexpected error: {UserId}", request.UserId);
        return StatusCode(500, new { Message = "Internal Server Error" });
    }
}
```

注意這裡的外層 catch 不做重試、不做補償、不嘗試修復。它只做兩件事：把錯誤分類、把上下文記錄下來。

---

## 中層（Service）不要急著 catch，先問一句：我有能力處理嗎？

進入多層呼叫後，最常見的錯誤是 Service 也包一層 `try-catch(Exception)` 然後直接 return null 或回傳 false。這種寫法雖然讓 API 看起來「不會壞」，但本質上是把錯誤吞掉，讓問題延遲爆炸。

> 在 Service 層，應該優先採用的策略是： 
> 只捕捉你能處理的例外，否則就讓它往上拋。

例如，`CreateOrderAsync` 的核心工作是 orchestrate 三個步驟：

1. 建立訂單
2. 付款請款
3. 寄確認信

這裡的關鍵不是每一步都 catch，而是把「失敗策略」寫清楚。付款失敗要讓流程中止；寄信失敗要被隔離。

```csharp
public async Task<Guid> CreateOrderAsync(CreateOrderRequest request)
{
    // 1) 寫入 DB：核心交易
    var orderId = await _orderRepository.CreateAsync(request);

    // 2) 請款：核心流程的一部分
    // 失敗就應該 throw，讓外層知道這筆訂單不能算成功
    await _paymentGateway.ChargeAsync(orderId, request.Amount);

    // 3) 寄信：附加功能
    // 失敗不應該讓整筆下單失敗
    await TrySendEmailAsync(orderId, request.UserEmail);

    return orderId;
}
```

此處不需要 catch 一切，反而要避免 catch 一切。

---

## 為什麼需要內層的 try-catch？：只有在「失敗可被隔離」時才合理

> 為什麼外層已經有try-catch，內層還要再寫一次try-catch？

注意這裡的`TrySendEmailAsync` 內層還有再用一次 try-catch 。看到這裡，你可能會問：既然外層（Controller / Handler）已經有異常處理了，為什麼內層還需要再包一個 `try-catch`？這不是重複嗎？答案在於多層呼叫時，不同層級的異常處理其實肩負不同目的。外層負責把整體流程的失敗「收斂」成一致的系統行為；內層則負責把某些錯誤「隔離」，避免可降級功能拖垮核心流程。

```csharp
private async Task TrySendEmailAsync(Guid orderId, string email)
{
    try
    {
        await _emailSender.SendOrderConfirmationAsync(email, orderId);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Send confirmation email failed: {OrderId} {Email}", orderId, email);
        // 不往上拋，避免影響下單成功
    }
}
```
### 業務邏輯的獨立性

在下單流程中，「寄出確認信」是一個附加功能。使用者下單時系統執行的核心動作是寫入訂單並完成請款；寄信只是讓體驗更完整，並不應該成為訂單是否成立的判準。換句話說，寄信成功與否不應該影響主要交易流程。

如果我們移除 `TrySendEmailAsync` 中的 `try-catch`，當寄信服務發生異常（例如 SMTP 連線中斷、第三方 email provider 暫時無回應）時，例外會一路向上傳播到外層的 `catch`。外層會把整個下單視為失敗，回傳 500。於是你會得到一個非常危險、也很常見的結果：訂單其實已經寫入資料庫、款項也可能已經扣了，但使用者看到的是「下單失敗」。這會直接引發重複下單、客服爭議、甚至退款與對帳的混亂。

因此，內層 try-catch 的核心價值不是保護程式不要拋錯，而是保護「核心流程」不要被「附加功能」綁架。

### 錯誤處理策略的差異

外層的異常處理通常採取「全有或全無」的策略。也就是說，只要整體流程中出現未被處理的例外，就把整個請求當作失敗處理，記錄 log 並回傳標準化錯誤。這個策略適合面對關鍵性錯誤，例如請款失敗、寫入資料庫失敗、必要欄位缺失，因為這些狀況下確實不應該讓交易看起來成功。

內層的異常處理則採取「最大努力」的策略。寄信失敗時，系統仍然讓下單流程完成，並把寄信失敗記錄下來，後續可以靠重試機制、補寄任務或客服人工處理補救。這種策略確保核心交易具備可用性，也讓系統具備韌性：即使某些非核心服務短暫故障，主要業務仍能持續運作。

### 錯誤追蹤的精確性

內層 `try-catch` 也能提供更精準的錯誤追蹤。如果例外被外層捕捉，你的 log 可能只會留下「CreateOrder unexpected error」之類的通用訊息，雖然有 userId，但你仍需要花時間判斷到底是寫 DB 壞掉、金流壞掉，還是寄信壞掉。

相反地，在 `TrySendEmailAsync` 內層捕捉異常時，你可以直接在 log 中標示「寄送確認信失敗」，並附上 `orderId`、`email` 等上下文。這會讓 on-call 或開發者在排查時立即命中問題區段，把時間花在真正需要修復的地方，而不是先猜錯誤發生在哪。

---

## catch 與 catch (Exception ex) 的差異

在設計內層的異常處理時，還有一個很容易被忽略、但影響非常實際的細節：你應該使用 `catch`，還是 `catch (Exception ex)`？這兩者看起來只有一點點語法差異，實際上差很多。

當你使用不帶參數的 `catch` 時，確實能攔住例外，流程也會如你預期繼續往下走。但代價是你拿不到例外物件本身，也就拿不到錯誤訊息、堆疊追蹤、inner exception 等診斷資訊。這代表你在記錄 log 的時候只能寫一段固定文字，最多帶上一些業務參數，卻無法包含「到底哪裡壞掉」。

相反地，使用 `catch (Exception ex)` 可以讓你取得完整的例外物件。在呼叫 `_logger.LogError(ex, message)` 時，日誌系統通常會自動把例外類型、訊息，以及完整 stack trace 一起寫入。這些資訊不是用來裝飾 log，而是你在排查問題時能否快速定點的關鍵。

以這篇文章的下單流程為例，假設寄信服務因為網路問題連不上（例如連線被拒絕或暫時 DNS 解析失敗）。如果你寫成不帶參數的 `catch`，log 可能只會長這樣：

```
寄送確認信失敗 - OrderId: 0f5d..., Email: user@example.com
```

你知道寄信失敗了，但不知道原因，於是只能猜：是 provider 掛了？是憑證過期？是 DNS？是 timeout？排查會直接變成碰運氣。

但如果你使用 `catch (Exception ex)`，log 會包含例外本體：

```
寄送確認信失敗 - OrderId: 0f5d..., Email: user@example.com
System.Net.Http.HttpRequestException: Connection refused
   at System.Net.Http.HttpClient.SendAsync(HttpRequestMessage request)
   at EmailSender.SendOrderConfirmationAsync(String email, Guid orderId)
   at OrderService.TrySendEmailAsync(Guid orderId, String email)
```

這種 log 在第一時間就能告訴你，問題是 HTTP 連線被拒絕，方向立刻縮小成「網路連線」或「服務可用性」而不是程式邏輯。

因此，除非你有明確理由不記錄例外（幾乎很少成立），否則在任何會寫 log 的情境下，都應該使用 `catch (Exception ex)`，把例外資訊保留下來。

---
## 結論：異常處理的設計原則

透過這個下單流程的案例，我們可以把多層呼叫下的異常處理歸納成幾個可重複使用的設計原則。這些原則的價值在於：它們能讓你在面對不同系統、不同業務流程時，仍然快速決定 try-catch 應該放在哪裡、該怎麼寫，以及該不該讓例外往上拋。

### 根據業務重要性分層處理

不是所有操作都具有相同的重要性。核心業務流程的失敗應該阻止整個操作繼續進行，而附加功能的失敗則可以被隔離處理。

在設計異常處理策略時，最先要做的不是把 try-catch 先寫上去，而是先辨識每個步驟的業務地位：哪些是關鍵步驟、哪些是輔助步驟。只有在這個分類完成後，你才有辦法決定例外要不要被隔離，以及隔離之後應該採取什麼恢復策略。

### 在適當的層級捕捉異常：我有能力處理嗎？

異常應該在「能夠妥善處理它」的層級被捕捉。如果某個方法無法對失敗做出有意義的決策，就不應該 catch，它應該讓例外向上傳播到更高層級，交給邊界層統一收斂。

但如果某個方法能採取明確且合理的錯誤恢復策略，例如「記錄 log 並繼續執行」、「啟動 fallback」、「改走降級路徑」，那麼在這個層級捕捉異常就是合理的。本文中的 `TrySendEmailAsync` 就屬於這種情況：它可以在寄信失敗時留下足夠的診斷資訊，同時不讓附加功能拖垮核心交易。

### 永遠保留異常資訊

當你捕捉異常時，應該總是使用 `catch (Exception ex)` 來保留例外物件。即使你當下只打算記錄一行訊息，將來當你需要排查問題時，例外的型別、訊息與 stack trace 會變得極其寶貴。

### 「在關鍵處」提供有意義的上下文資訊

> 在關鍵處很重要，加log要加在有邏輯分支的地方，換言之有if才會需要log，不然log記太多會雜訊太多也不好查問題。

記錄異常時，除了例外本身，也應該包含當時的業務上下文。例外告訴你「發生了什麼錯」，上下文告訴你「這個錯發生在哪一筆業務資料上」。

以本文案例來說，內層 log 應該至少包含 `orderId`、`email` 等資訊，外層 log 則應該包含 `userId`、request payload 或 trace id 等，以利跨服務追查。這些上下文資訊能幫助你快速重現問題、判斷問題是偶發還是系統性的，並且在資料量大、服務多的環境下依然可以有效定位。
