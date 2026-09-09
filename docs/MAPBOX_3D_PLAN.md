# Mapbox 3D 公車地圖 → PWA → WebAR 實作計畫
日期：2026-09-09

## 修訂：僅 GitHub Pages
依使用者後續指示，取消 Cloudflare 與資料快照方案，改成瀏覽器輸入 TDX Access Token，直接請求 TDX。
TDX token 僅存頁面記憶體；Actions 只支援注入 Mapbox 公開 token，不公開 TDX Secrets。
2026-09-09 OPTIONS 預檢探測回傳 401 且無 CORS 允許標頭，真實直連受阻；保留前端直連能力與清楚錯誤提示，不宣稱已打通。詳見 MAPBOX_SETUP.md。

## 目標與預設
先交付 GitHub Pages 靜態網頁。預設路線 57 / 706 / 243 / 214直 / 橘3；路線可增刪並指定 Taipei / NewTaipei。
A：第一銀行連城分行 (24.99663, 121.48691)。
B：臺灣銀行新永和分行 (25.01309, 121.51276)。
A/B 名稱與座標可編輯，儲存在本機；地圖可點選設定位置。

## Phase 1 — 本次實作
- 原有 Python 研究與結果保留，新增 web/ 獨立靜態入口。
- Mapbox GL JS Standard 3D 建築、傾斜視角、2D/3D 切換、A/B marker。
- 公車 GPS 直接顯示在地圖，以路線、方向、車牌及資料時間辨識；列表與地圖互相選取。
- 顯示公車到 A 或使用者 GPS 的球面直線距離，明確不是沿道路距離或到站 ETA。
- GPS 權限失敗可繼續使用 A；過期定位標示、不推算虛假移動。
- 即時模式與明確標示的示範模式分離；無 API 不偽装即時。
- 可編輯路線、A/B、Mapbox 公開 token、代理 URL；設定驗證及本機儲存。
- TDX RealTimeByFrequency 由瀏覽器直接請求；使用者貼 Access Token，僅存記憶體；支援逾時、401、403、429、CORS 錯誤提示。
- GitHub Pages workflow 僅发布 web/；手動在本 branch 執行部署，避免改 main 與原站。
- Node 測試距離、設定驗證、TDX 正規化、過期狀態與直連失敗行為。

## 部署依賴
Mapbox pk.* token（限制 GitHub Pages 網域）；不可放 sk.*。
即時資料需要使用者的有效 TDX Access Token，且 TDX 必須允許 CORS 預檢與 GET；目前預檢未通過。
未提供憑證時完成程式與部署設定，但不能宣稱 Mapbox 與即時 TDX 已線上驗證。
GitHub Pages 設為 GitHub Actions；是否已有站點及可用權限在實作後確認。

## Phase 2 — PWA（後續）
manifest、icon、安裝引導、service worker 僅快取 app shell。
離線不得把歷史公車顯示為即時；明確顯示最後定位時間。
背景頁面暫停輪詢、重新可見後更新，驗證 iOS/Android 安裝與升級。

## Phase 3 — WebAR（後續）
先做相機＋GPS＋羅盤方向的遠方公車標籤，沿用距離/vehicle schema。
需 HTTPS、使用者手勢授權相機與方向感測器；顯示定位精度及校正提示。
這是地理方位疊圖，不是能穿透建築精確貼合真實車身的視覺追蹤。
iOS/Android 的 WebXR 與 orientation 支援分別探測，不支援回退地圖。
實機驗收：方向誤差、GPS 漂移、不同螢幕方向、遮擋與過期資料；之後再评估 WebXR 空間錨點。

## 不誤導的邊界
本次不是 A→B 轉乘規劃器；顯示所選路線雙向車輛並提供方向篩選。
既有 StopUID 是每路線獨立，不能混用；後續加入到站預測時需依路線/方向/站牌查 ETA。
A/B 連線不當成公車行駛路線，不用直線距離換算到站分鐘。
3D 建築覆蓋與精度依 Mapbox 資料，並非每棟建築都有精細模型。

## 參考
- https://docs.mapbox.com/mapbox-gl-js/example/3d-buildings/
- https://docs.mapbox.com/mapbox-gl-js/guides/styles/
- https://tdx.transportdata.tw/
