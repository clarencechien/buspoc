# GitHub Pages 3D 公車地圖

本版本只有 `web/` 靜態前端，沒有 Cloudflare Worker、API 代理或排程資料快照。

## 使用

1. 開啟「路線與設定」，填 Mapbox `pk.*` 公開 token。
2. 貼上 TDX **Access Token**（可帶 Bearer 前綴），不是 Client ID / Client Secret。
3. 按「儲存設定」。前端直接向 TDX 讀取五條路線 GPS，每 45 秒重新查詢。
4. TDX token 只存在此頁面的 JavaScript 記憶體；不進 localStorage、sessionStorage、URL、repo 或部署檔。重新整理後需再輸入，亦可手動清除。
5. 401 會清除記憶體 token，要求重新輸入；429 暫停至少 60 秒。部分路線失敗逐條提示；全部失敗保留上次資料並標示。

A/B、路線與 Mapbox 公開 token 是可保存的本機設定；TDX token 與它們分離。

## 先前執行環境的直連探測（2026-09-09）

實測從 `https://clarencechien.github.io` Origin 對 TDX RealTimeByFrequency/NewTaipei/57 發送 OPTIONS，要求 GET + authorization header，回傳 HTTP 401，沒有 Access-Control-Allow-Origin。瀏覽器預檢本來就不帶 Access Token，因此這個回應會阻擋標準 Authorization Bearer 跨域請求。

這是 HTTP 預檢探測，尚未進行帶有效 token 的實機瀏覽器驗收。若 TDX 改為允許該 Origin 的預檢與 GET，現有前端即可運作；該次探測不能代表所有使用者環境；使用者後續截圖已顯示實際公車 GPS，本次新增功能仍需在其瀏覽器驗收。網頁遇到這類錯誤會顯示「網路或跨網域（CORS）限制」，不把它誤報成沒有車輛。

本次不加入代理、公共 CORS 轉送服務、停用瀏覽器安全設定或偽造即時資料。示範資料需使用者主動切換，會明確標示。

## GitHub Actions Secret 能不能用？

- **Mapbox 公開 token：可以。** Workflow 優先讀取 Actions Variable `MAPBOX_PUBLIC_TOKEN`，否則讀取同名 Secret。只接受 `pk.*`。它會進公開網頁，這是 Mapbox 公開 token 的用途，請限制使用網域。
- **TDX Client Secret / Access Token：不注入。** Actions Secret 只在 runner 內私密；寫進靜態 JS 後便公開。Pages 沒有伺服器能私密交換或更新 TDX token。
- Workflow 不讀取 TDX Secrets，不產生公車快照，也沒有定時 workflow。

## GitHub Pages 部署

1. Repo Settings → Pages → Source：GitHub Actions。
2. 可選：設定 Variable 或 Secret `MAPBOX_PUBLIC_TOKEN`；未設定時由使用者在頁面輸入。
3. Mapbox 公開 token 限制允許 `https://clarencechien.github.io/*`，本機另設 localhost 用途。
4. `.github/workflows/pages.yml` 只跑測試並部署 `web/`。
5. Workflow 通常需要先存在 default branch，才能在 Actions UI 選 branch 手動執行。本次僅更新 `feat/mapbox-3d-web`，未變更 main 或自動部署。
6. 預期站址 `https://clarencechien.github.io/buspoc/`；同 repo Pages 只有一個站，不是每 branch 獨立站址。

## 本機檢查

```sh
node --test
npm run check
python3 -m http.server 8000 --directory web
```

無需安裝 npm 套件。用 localhost:8000 開啟，不能用 file://。

## 畫面與資料

- 3D 地圖採 Mapbox Standard；公車使用 Three.js 立體車體（放大示意）與可選取距離標籤。
- 公車到 A 或使用者位置的球面直線距離，不是行車路徑長度或 ETA。
- GPS 使用 TDX GPSTime；>120 秒標示過期，>=600 秒或未知時間隱藏，不推測移動。
- 去返程依 TDX 定義，尚未判斷是否可由 A 抵達 B。
- 改路線直接改 TDX 查詢；214直預設 Taipei，其餘預設 NewTaipei。
- 背景暫停輪詢、返回前景更新；定位使用一次性 GPS，可再次按「定位到我」。

參考：[TDX 官方授權說明](https://github.com/tdxmotc/TDX-Gitbook/blob/main/api-shi-yong/hmac.md)、[Mapbox Standard](https://docs.mapbox.com/map-styles/reference/standard/)。


## 3D 車體與路線（2026-09-09 新增）

使用者最新截圖已能顯示真實車牌與 GPS，也收到 TDX 429。先前執行環境的 CORS 探測不能概括使用者瀏覽器的實際連線狀態；本次保留直連並改善限流處理。

- 3D 車體：輪胎、玻璃、車頂空調、前後燈、金屬漆，與路線同色。最近三輛 2.7 倍示意比例加光圈，其餘 1.8 倍；最多繪製 30 個模型，位置不推測移動。未提供方位時車頭僅為示意。
- 預設只看最近三輛，編號 1/2/3；可取消以看所有車輛。一鍵框選最近三輛和距離基準位置。不是下一班到站排序。
- 706 固定紫色、57 藍色、243 綠色、214直 粉色、橘3 橘色，不隨路線排序變化。
- 「上車→下車」選一條路線載入 StopOfRoute 與 Shape，顯示實際道路區段與站點。一次聚焦一條路線，避免重疊遮擋；更換選單可逐條查看。
- 原始 A/B 優先使用 repo 的每路線 StopUID；改 A/B 時以同方向上車在前、下車在後的最近站點組合作為可調初選，不代表最佳旅程推薦。
- 線形不匹配、距離站點超過 150m、逆序或不支援的 WKT 格式，不畫假道路，只保留站点。
- 「查上車站下一班」讀取官方 EstimatedTimeOfArrival；依所選方向及 StopUID 顯示下一筆預估和查詢時間，與地圖最近三輛各自獨立，不保證是同三輛車。此值需手動更新。
- 站點與 Shape 快取 24 小時；只有明確點擊載入才查。公車位置只查啟用路線，每 45 秒輪詢，所有 TDX 請求共用 1.6 秒間隔序列，429 共用至少 60 秒退避。
- 可切日間、黃昏、夜景。車體為程式建立的低多邊形網格，沒有外部模型授權或貼圖下載依賴；Three.js 自固定版本 CDN 載入。失敗時保留標籤。

驗收限制：Node 測試檢查線形截取、方向站序、ETA 配對與資料請求；尚未以真實憑證驗證此次模型畫面、Shape/ETA 回應及手機 GPU 效能。
