---
publish: true
tags:
date:
comments: true
---

> [!summary]- 目錄
> - [[#Serializer|Serializer]]
> - [[#DRF 建 API 的常見方式|DRF 建 API 的常見方式]]
>   - [[#Function-based|Function-based]]
>   - [[#Class-based|Class-based]]
> - [[#以ListAPIView 看 request flow|以ListAPIView 看 request flow]]

# Serializer

通常使用情境有兩類：

1. GET: 序列化
	```python
	# rule + data: Serializer 內部存放了規則，而model_instance內部存放了資料
	serializer = Serializer(model_instance)
	serializer.data # 套規則得到的結果是 python dictionary
	```

2. POST: 反序列化
	```python
	serializer = Serializer(data=request.data)
	seralizer.is_valid() # 驗證得到validated_data
	serializer.save() # update or create
	```

| Django                                                        | DRF                                                                                                                                                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request.body` 是原始 bytes，需要自己解析，例如 `json.loads(request.body)` | DRF 會根據 Content-Type 自動使用 Parser（例如 JSONParser）解析請求內容，可以直接透過 `request.data` 取得 Python dict                                                                                                                |
| `HttpRequest` 提供原始請求資訊                                        | `Request` 封裝 `HttpRequest`，額外提供 `data`、`query_params`、`auth`、`user` 等 API 開發常用屬性。<br><br>Request  <br>= HttpRequest  <br>+ Parser  <br>+ Authentication  <br>+ Content Negotiation  <br>+ API-friendly 屬性 |
| `HttpResponse` 需要自己處理 JSON 序列化，例如 `JsonResponse()`            | `Response` 會搭配 Renderer 自動序列化資料（通常輸出 JSON）                                                                                                                                                                |
```
fields
= serializer 對外公開的欄位清單

read_only_fields
= 只能輸出，不能由 client 輸入

write_only
= 只能輸入，不會輸出
```

# DRF 建 API 的常見方式

## Function-based
1. `@api_view`  
    最簡單的 function-based API。

## Class-based
1. `APIView`  🟢
    class-based API，自己明確寫 `get()`、`post()`、`put()`、`delete()`。
    
2. `GenericAPIView` + 自己選 mixins 組裝  
    比 `APIView` 更 DRF 化，可以混搭 list/create/retrieve/update/delete 行為。

	`GenericAPIView` 是建立在 `APIView` 上面的，它多提供了和資料庫、Serializer 有關的工具：
	```python
	queryset
	serializer_class
	get_queryset()
	get_serializer()
	get_object()
	```
	但是 `GenericAPIView` 本身沒有完整的 CRUD 行為。例如它自己不會提供：

	```python
	list()
	create()
	retrieve()
	update()
	destroy()
	```
	這些行為來自 mixins。

	```python
	from rest_framework.generics import GenericAPIView
	from rest_framework.mixins import ListModelMixin, CreateModelMixin
	
	from .models import Product
	from .serializers import ProductSerializer
	
	
	class ProductListCreateAPIView(
	    ListModelMixin,   # <--- 自己組裝 mixin
	    CreateModelMixin, # <--- 自己組裝 mixin
	    GenericAPIView,
	):
	    queryset = Product.objects.all()
	    serializer_class = ProductSerializer
	
	    def get(self, request, *args, **kwargs):
	        return self.list(request, *args, **kwargs)
	
	    def post(self, request, *args, **kwargs):
	        return self.create(request, *args, **kwargs)
	
	```

	這裡要分清楚兩組方法：

	```
	HTTP method        mixin 提供的行為
	get()       →      list()
	post()      →      create()
	put()       →      update()
	delete()    →      destroy()
	```
	也就是 mixin 提供 `list()`，但你仍然要自己把 `get()` 接到 `list()`。這種方式的價值是：你可以自由組裝需要的功能。
3. Concrete generic views  🟢
    DRF 幫你組好的常用類別 = GenericAPIView + 指定的 mixins + HTTP method 對應，例如：
    
    - `ListAPIView`
    - `CreateAPIView`
    - `RetrieveAPIView`
    - `ListCreateAPIView`
    - `RetrieveUpdateDestroyAPIView`

	例如：
	
	```python
	class ProductListCreateAPIView(ListCreateAPIView):
	    queryset = Product.objects.all() # 這個 view 可以操作哪些資料
	    serializer_class = ProductSerializer
	```
	
	這一小段就等價於：
	
	```python
	class ProductListCreateAPIView(
	    ListModelMixin,
	    CreateModelMixin,
	    GenericAPIView,
	):
	    queryset = Product.objects.all()
	    serializer_class = ProductSerializer
	
	    def get(self, request, *args, **kwargs):
	        return self.list(request, *args, **kwargs)
	
	    def post(self, request, *args, **kwargs):
	        return self.create(request, *args, **kwargs)
	```
	
	因此 Concrete Generic Views 不是一套完全不同的東西，而是：
> 	DRF 預先組裝好的 `GenericAPIView + mixins`。
3. `ViewSet`  
    把一組相關行為放在同一個 class，例如 `list()`、`create()`、`retrieve()`。
    
4. `ModelViewSet` + `Router`  
    最自動化的方式。你定義一個 `ModelViewSet`，再用 `router.register()` 自動產生 URL。

```
Function-Based View
└── @api_view


Class-Based View
└── APIView
    ├── GenericAPIView
    │   ├── GenericAPIView + Mixins
    │   ├── Concrete Generic Views
    │   └── GenericViewSet
    │       └── ModelViewSet
    │
    └── ViewSet
```

# 以`ListAPIView` 看 request flow

```
request
  ↓
ListAPIView.get()
  ↓
ListModelMixin.list()
  ↓
self.get_queryset()
  ↓
filter_queryset(queryset)
  ↓
serializer = self.get_serializer(queryset, many=True)
  ↓
Response(serializer.data)
```

簡化原始碼大概是：

```python
def list(self, request, *args, **kwargs):
    queryset = self.filter_queryset(self.get_queryset())

    serializer = self.get_serializer(queryset, many=True)

    return Response(serializer.data)
```

為什麼不能這樣寫？

```python
class JobListView(generics.ListAPIView):
    queryset = Job.objects.filter(owner=request.user) # 我想要取得該使用者的 jobs
```

因為 class 被 import 時，根本還沒有 request。注意執行順序：

```
啟動 Django
  ↓
import views.py
  ↓
建立 JobListView class
  ↓
此時沒有任何使用者 request
```