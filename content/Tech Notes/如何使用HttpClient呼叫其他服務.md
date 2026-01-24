---
publish: true
tags:
  - csharp
date:
comments: true
---
# 問題情境

我想要在外部服務的controller中使用http client去呼叫內部服務，但我不知道要怎麼做？

常見有兩種做法[[#Named Clients]]和[[#Typed Clients]]，因為Typed Clients寫起來最乾淨，實務上也最常用，是我最後採納的。

# Named Clients

```jsx
builder.Services.AddHttpClient("InternalMemberService", client =>
{
    client.BaseAddress = new Uri("<https://internal-member-service/api/>");
});

public ExternalController(IHttpClientFactory factory)
{
    _client = factory.CreateClient("InternalMemberService");
}

```

# Typed Clients

Typed Client = 由 DI 建立、由 Factory 注入 HttpClient、由你自己包成一個服務類別的 HttpClient 封裝

Typed Clients就是「已被組裝好的HttpClient」（你指定好 BaseAddress、Header、Timeout、Polly policy 等等），所以可以被用來專門呼叫某個外部Api

## 先會用

```csharp
// In Program.cs
builder.Services.AddHttpClient<IMemberServiceClient, MemberServiceClient>(client =>
{
    client.BaseAddress = new Uri("<https://internal-member-service/api/>");
    client.Timeout = TimeSpan.FromSeconds(5);
});
```

AddHttpClient有什麼魔法？
1. 它註冊 IHttpClientFactory
2. 它註冊你的 Typed Client 為 transient（為什麼HttpClient每次都是新的，難道系統sockets不會用光嗎？見：[[#底層發生什麼事情？]]）
3. 它決定 HttpClient 的「客製化設定」

```csharp
// 建立Typed Client
public class MemberServiceClient : IMemberServiceClient
{
    private readonly HttpClient _http;
    public MemberServiceClient(HttpClient http) => _http = http;

    public async Task<MemberDto?> GetMember(int id)
    {
        return await _http.GetFromJsonAsync<MemberDto>($"members/{id}");
    }
}
```

```csharp
// 在Controller中使用
public ExternalController(IMemberServiceClient memberService)
{
    _memberService = memberService;
}

```

## 底層發生什麼事情？

![[typed-clients.png]]

官方圖片的意思：
1. Controller → 用你的 ClientService（例如 CatalogService）
2. ClientService 需要 HttpClient → DI 向 IHttpClientFactory 要
3. IHttpClientFactory 從 Handler Pool 取出 HttpMessageHandler
4. 組裝出一個 HttpClient → 注入到你的 Typed Client 裡
5. Typed Client 本身已經套好你在 AddHttpClient() 內設定的行為

### 問題
1. HttpClient 每次都是新的，但它背後的 HttpMessageHandler 是被重用的，而且有限期。為什麼 IHttpClientFactory 要「重複使用」 HttpMessageHandler？
	
	因為HttpMessageHandler 負責管理 TCP 連線池
	- 它才是跟外部 API 真正維持連線的人
	- HttpClient 只是個「外觀」，不負責實際連線
	如果你每次 new HttpClient 都 new Handler：
	- 你就一直建立新的 TCP 連線
	- 舊連線沒有被釋放 → Socket 變成 TIME_WAIT → 爆掉
	所以 Handler 必須被 pool 化、重用。
1. 但 Handler 不能永久重用，為什麼？
	* 因為長期重用 Handler = 無法反應 DNS 變更，假設同一個Api domain name對應的ip換掉，Handler 會繼續把舊 IP 放在連線池裡，永遠連不到新 server。
	* Handler 預設在 pool 裡最多活 2 分鐘
2. 最大的問題是我不知道要用什麼http client method去呼叫uri，有太多選擇([HttpClient Class (System.Net.Http) | Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient?view=net-8.0))
	* GetAsync() → 需要 StatusCode、Header 時用這個
	* GetStringAsync() -> 少用，拿不到 StatusCode，無法檢查錯誤（400, 500 你都不知道），只適合 demo
	* GetFromJsonAsync() -> 只要 JSON、不要處理 StatusCode、自動序列化
# 比較

| **取得方式** | `factory.CreateClient("name")` | 直接注入介面/類別        |
| -------- | ------------------------------ | ---------------- |
| **耦合度**  | Controller 需知道名稱               | Controller 只依賴介面 |
| 實務上      | 快速、多樣化的 HttpClient 設定          | 長期維護、乾淨架構        |
# References
[Use IHttpClientFactory to implement resilient HTTP requests - .NET | Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/use-httpclientfactory-to-implement-resilient-http-requests)