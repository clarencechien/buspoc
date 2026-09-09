# GitHub Pages 3D 公車地圖

本版本只有 `web/` 靜態前端，沒有 Cloudflare Worker、API 代理或排程資料快照。

## 使用

1. 開啟「路線與設定」，填 Mapbox `pk.*` 公開 token。
2. 貼上 TDX **Access Token**（可帶 Bearer 前綴），不是 Client ID / Client Secret。
3. 按「儲存設定」。前端直接向 TDX 讀取五條路線 GPS，每 30 秒重新查詢。
4. TDX token 只存在此頁面的 JavaScript 記憶體；不進 localStorage、sessionStorage、URL、repo 或部署檔。重新整理後需再輸入，亦可手動清除。
5. 401 會清除記憶體 token，要求重新輸入；429 暫停至少 60 秒。部分路線失敗逐條提示；全部失敗保留上次資料並標示。

A/B、路線與 Mapbox 公開 token 是可保存的本機設定；TDX token 與它們分離。

## 目前直連限制（2026-09-09）

實測從 `https://clarencechien.github.io` Origin 對 TDX RealTimeByFrequency/NewTaipei/57 發送 OPTIONS，要求 GET + authorization header，回傳 HTTP 401，沒有 Access-Control-Allow-Origin。瀏覽器預檢本來就不帶 Access Token，因此這個回應會阻擋標準 Authorization Bearer 跨域請求。

這是 HTTP 預檢探測，尚未進行帶有效 token 的實機瀏覽器驗收。若 TDX 改為允許該 Origin 的預檢與 GET，現有前端即可運作；在目前測到的回應下，**不能宣稱純 Pages 的真實公車直連已打通**。網頁遇到這類錯誤會顯示「網路或跨網域（CORS）限制」，不把它誤報成沒有車輛。

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

- 3D 地圖採 Mapbox Standard；公車為可選取標籤，不是真實比例 3D 車身模型。
- 公車到 A 或使用者位置的球面直線距離，不是行車路徑長度或 ETA。
- GPS 使用 TDX GPSTime；>120 秒標示過期，>=600 秒或未知時間隱藏，不推測移動。
- 去返程依 TDX 定義，尚未判斷是否可由 A 抵達 B。
- 改路線直接改 TDX 查詢；214直預設 Taipei，其餘預設 NewTaipei。
- 背景暫停輪詢、返回前景更新；定位使用一次性 GPS，可再次按「定位到我」。

參考：[TDX 官方授權說明](https://github.com/tdxmotc/TDX-Gitbook/blob/main/api-shi-yong/hmac.md)、[Mapbox Standard](https://docs.mapbox.com/map-styles/reference/standard/)。
