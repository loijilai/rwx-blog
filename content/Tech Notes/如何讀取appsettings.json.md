---
publish: true
tags:
  - csharp
date:
comments: true
---
 App的設定檔是一個比想像中更重要、也更複雜的問題，如果沒有弄清楚，常常會不知道程式受到什麼設定值影響，這在部署階段最容易發生。
 

# App configuration的組成

按照由低到高的優先順序組成：
1. appsetting.json
2. appsetting.{Environment}.json
3. launchSetting.json
4. environment variable
5. command line arguments

* 注意launchSetting只有在本地開發才會用到，他是執行dotnet run時的一些設定，不會真正在production environment被帶上
* environment variable的部分，在容器化的階段可以在docker file中用ENV:帶入

# 讀取設定值

在寫Api時，常常會需要用到appsettings.json中的設定，這時候有兩種最常見的作法([[#小設定]]與[[#大設定、結構化、多處共用 → Option Pattern]])

## 小設定

這邊常見兩種模式，讀取方式都是用GetValue和GetSection，兩者的方法一模一樣因為都基於 IConfiguration
1. [[#在 Program.cs 用 builder.Configuration]]
2. [[#在 Service/Controller 用注入的 IConfiguration]]

### 在 Program.cs 用 builder.Configuration

先介紹最基礎的，在Program.cs中應該常常看見這種讀取設定值的方式：

```csharp
var builder = WebApplication.CreateBuilder(args);
// 讀取設定值
var host = config.GetValue<string>("KafkaInfo:Host");
var section = config.GetSection("MongoDbBatchWrite");
```

builder.Configuration 的實際型別是：Microsoft.Extensions.Configuration.ConfigurationManager，他實作了IConfigurationManager，而後者又實作了IConfiguration。

只要有實作[IConfiguration](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.configuration.iconfiguration?view=net-10.0-pp)，就可以用我們熟悉的GetValue, GetSection。

> builder.Configuration = 一個繼承了 IConfiguration 的強化版本。

### 在 Service/Controller 用注入的 IConfiguration

超方便的，在Service/Controller寫個IConfiguration就可以跟builder.Configuration一樣去取用設定檔。

- Program.cs **在註冊服務**，通常會使用全域的 builder.Configuration直接取得。    
- Service/Controller **需要依賴反轉（DI）**，必須注入 IConfiguration，而不是直接拿 builder 的實例。

舉個例子：
1. 用GetValue讀取設定值
	```csharp
	public class MongoService
	{
	    private readonly IConfiguration _config;
	
	    public MongoService(IConfiguration config) // 透過DI注入
	    {
	        _config = config;
	    }
	
	    public void Test()
	    {
		    // 讀取設定值
	        var batchSize = _config.GetValue<int>("MongoDbBatchWrite:BatchSize");
	        var interval = _config.GetValue<int>("MongoDbBatchWrite:FlushIntervalSeconds");
	
	        Console.WriteLine(batchSize);
	        Console.WriteLine(interval);
	    }
	}
	```

2. 用GetSection讀取設定值
	```csharp
	var section = _config.GetSection("MongoDbBatchWrite");
	var batchSize = section.GetValue<int>("BatchSize");
	```

## 大設定、結構化、多處共用 → Option Pattern

> 定義：Option Pattern 在 .NET 用來把設定檔（appsettings.json 等）的某一段，安全、強型別地綁到 C# 的類別，並透過 DI 注入

當設定：
- 被 2 個以上的 class 使用
- 有很多欄位、有nested structure
- 需要驗證格式
- 想讓單元測試更乾淨
這時再升級成 Option Pattern 比較值得

### 使用方式

1. **appsettings.json**
	```json
	{
	  "ApiSettings": {
	    "ApiKey": "abc123",
	    "TimeoutSeconds": 30
	  }
	}
	```

2. 新增一個**Options Class**
	```csharp
	public class ApiSettingsOptions
	{
	    public string ApiKey { get; set; } = string.Empty;
	    public int TimeoutSeconds { get; set; }
	}
	```

3. **Program.cs**中
	```csharp
	builder.Services.Configure<ApiSettingsOptions>(
	    builder.Configuration.GetSection("ApiSettings"));
	```
	* 這行把「ApiSettings」變成一個可以被注入使用的強型別設定物件。
		他先把 appsettings.json 裡的 ApiSettings 那一段，讀出來、轉成 ApiSettingsOptions 類別，然後把它註冊到 DI 容器裡。之後在任何 Service、Controller 裡，只要注入 IOptions\<ApiSettingsOptions\>，就能拿到這組設定。
	* Configure\<T\>，的功用是：Registers a configuration instance (設定資料) that ApiSettingsOptions will bind against. 
		這裡的configuration instance就是我們透過builder.Configuration得到的設定區塊
4. **使用方**
	```csharp
	public class ApiClient
	{
	    private readonly ApiSettingsOptions _settings;
	
	    public ApiClient(IOptions<ApiSettingsOptions> options) // 透過DI注入
	    {
	        _settings = options.Value; // 記得要取Value
	    }
	
	    public void Call()
	    {
	        Console.WriteLine(_settings.ApiKey);
	    }
	}
	```