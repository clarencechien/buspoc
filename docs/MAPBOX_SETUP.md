# 3D 公車地圖部署

本 branch 的 `web/` 是 GitHub Pages 前端；`worker/` 是 TDX 代理。原本研究檔案不變。

## 本機驗證

需要 Node 20+（建議 24），無 npm 套件相依：

```sh
npm test
npm run check
python3 -m http.server 8000 --directory web
```

開啟 localhost:8000。設定 Mapbox `pk.*` token；如只試 UI，可切換「示範資料」。示範點是合成座標，並非真實車輛或真實路線軌跡。未設定 token 時不顯示假底圖。

## TDX 代理

安裝 Cloudflare Wrangler 並登入帳號後：

```sh
cd worker
npx wrangler secret put TDX_CLIENT_ID
npx wrangler secret put TDX_CLIENT_SECRET
npx wrangler deploy
```

`ALLOWED_ORIGIN` 預設 `https://clarencechien.github.io`（Origin 不含 `/buspoc`）。本機驗證時改為 `http://localhost:8000`；此值只限制瀏覽器來源，不是身份驗證或防濫用保證。對外公開時可在 Cloudflare 設定 rate limiting，並監看 TDX 配額。每條路線快取 30 秒，同一 isolate 合併同時查詢；最多 10 條路線，僅允許雙北城市。不做任意 URL 代理。

瀏覽器填部署後的 Worker base URL，例如 `https://buspoc-vehicles.<account>.workers.dev`，不含 `/vehicles`。GPS 使用 TDX `GPSTime`，不以抓取時間取代定位時間。單一路線失敗會標示；全數失敗保留前次成功資料並告警，不切示範資料。

## GitHub Pages

1. Repo Settings → Pages → Source 選 **GitHub Actions**。
2. Settings → Secrets and variables → Actions → **Variables**，設定 `MAPBOX_PUBLIC_TOKEN` 與 `BUS_API_URL`。兩者是公開前端配置，TDX secret 不得放這裡或 web/。
3. Mapbox token 允許 `https://clarencechien.github.io/*`；本機測試可另建 localhost 專用公開 token，權限依 Mapbox 官方 GL JS 要求配置。
4. 此 branch 新增手動 `pages.yml`。GitHub 通常要求 workflow 先存在於 default branch 才能在 Actions UI 手動執行。可合併此 branch 後執行；若要先部署 branch，可只把 workflow 引入 main，再選 `feat/mapbox-3d-web` 執行。未經要求不在本次改動 main。
5. 部署目標為 `https://clarencechien.github.io/buspoc/`；同一 repo 只有一個 Pages 站點，部署 branch 會更新該站，不是獨立 preview 網址。

沒有 repo variables 也可部署，訪客在「路線與設定」自行填 token 與 API；設定存在自己的瀏覽器。PWA / WebAR 尚未啟用，見計畫文件。

## 使用界線

- 首次畫面以 A 周圍的 3D 建築為中心；「查看 A・B」顯示兩端。
- 地圖公車是可點選圖示／標籤，並非真實比例的 3D 車身模型。
- 公車直線距離依 A 或一次性 GPS 定位計算，不是行車路徑長度、行進方向判斷、候車推薦或 ETA。
- 資料每 30 秒更新，背景頁暫停；位置不推測、不外插。
- 定位 >120 秒標示過期，>=600 秒或未知時間不顯示。使用者 GPS 可重新按定位更新。
- 目前雙向車輛，路線去返程定義由 TDX 決定，不等於 A→B。尚未加入路線 polyline、站牌 ETA 及可達性計算。
- 3D 建築依 Mapbox 覆蓋。地圖錯誤不阻擋距離列表，亦不偽造即時結果。

## 後續驗收

取得真實憑證後：確認 Mapbox token 網域、3D 建築與手機效能；核對五條路線 GPS/方向；測試 TDX 429、定位拒絕、過期、切背景恢復；於 iOS/Android 驗證設定視窗與地圖點選。Node 測試不代表已做實機／真實 API 驗證。

參考：[Mapbox Standard](https://docs.mapbox.com/map-styles/reference/standard/)、[3D buildings](https://docs.mapbox.com/mapbox-gl-js/example/3d-buildings/)、[TDX](https://tdx.transportdata.tw/)。
