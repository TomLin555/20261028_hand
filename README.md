# 手勢映畫 · 手勢圖片播放器

GitHub：[TomLin555/20261028_hand](https://github.com/TomLin555/20261028_hand)。部署設定與上線步驟見 [DEPLOYMENT.md](DEPLOYMENT.md)。

使用攝影機即時辨識手部動作，控制右側圖片展示。桌機採左側攝影機、右側圖片的雙欄版面；手機改為上下排列。Python FastAPI 提供網頁與靜態資源，MediaPipe 在瀏覽器的 Web Worker 中辨識，影像與使用者匯入的圖片均不會上傳。

## 功能與操作

| 手勢 | 圖片操作 |
| --- | --- |
| 張開手掌向左移 | 上一張 |
| 張開手掌向右移 | 下一張 |
| 只伸出食指，停留半秒 | 第一張 |
| 只伸出小指，停留半秒 | 最後一張 |
| 單手張開，手心／手背翻轉 | 目前圖片左右翻轉 |
| 雙手先分開，再向內拍手合掌 | 目前圖片上下翻轉 |
| 單手直立張開，再將手掌向下彎折 | 切換目前圖片的馬賽克 |
| 拇指與食指由張開到捏合 | 目前圖片縮小一級 |
| 拇指與食指由捏合到分開 | 目前圖片放大一級 |

左右方向依左側的鏡像畫面為準。原有圖片切換操作使用單手，手掌朝向鏡頭；食指／小指手勢需收起其餘三指，拇指姿勢不影響判定。靜態手勢維持不動只觸發一次，放鬆手指約 0.25 秒後可再次操作。每次動作之間有一秒冷卻，避免連續誤翻；到第一／最後一張時停止，不循環跳轉。

新增手心／手背翻轉：單手張開，先停留約 0.2 秒建立方向，再緩慢經過側面翻到另一面，停留約 0.2 秒，圖片便會左右翻轉。保持同一面不會連續觸發；再次翻面會翻回原狀。

新增雙手拍手：雙手先張開分離，再於鏡頭內一起向中央合掌。使用視覺辨識雙手接近，不需要麥克風或拍手聲音。每次合掌只觸發一次，需再分開雙手才可重新拍手。兩隻手都需保持在畫面內，動作過快或互相遮擋可能無法辨識。雙手出現時優先處理拍手，避免誤切圖片。

翻轉僅作用於目前照片，字幕及按鈕維持正向。左右與上下翻轉可組合，切換圖片時各自保留方向；重新整理後還原。新增「左右翻轉」、「上下翻轉」及「還原方向」按鈕，可在不使用攝影機時操作。

新增手掌下折：先張開手掌、手指向上，穩定約 0.2 秒，再保持手腕位置，讓手掌向下彎折並停留約 0.25 秒，切換馬賽克。手掌立起停留約 0.2 秒後，再折一次即可還原。只把整隻手往下移或握拳不會套用此效果。馬賽克以低解析度 Canvas 像素化，不使用模糊濾鏡；字幕及控制按鈕維持清楚。

新增指尖縮放：收起中指、無名指、小指，拇指與食指先形成 C 字、停留約 0.2 秒，再一起向內捏合並停留約 0.2 秒，圖片縮小；兩指一起分開則放大。每完成一次開合只縮放一級，保持姿勢不連續縮放。初次看到張開／捏合姿勢只建立基準，不直接縮放；會確認兩個指尖都有移動，避免將原有食指操作當成縮放。

縮放範圍為 50%～200%，每次放大乘以 1.25、縮小乘以 0.8，例如 100% → 80% → 100%。手勢縮放期間暫停食指切圖，張開其他手指或移出鏡頭即可結束縮放操作。另有「馬賽克」、縮小／放大及「原始大小」按鈕。馬賽克、縮放與翻轉可同時使用，各圖片分別保留設定；還原方向只重設翻轉，原始大小只重設縮放。

也支援四個播放按鈕、點選縮圖與鍵盤 `←`、`→`、`Home`、`End`。內附五張風景示範圖片，可按「匯入圖片」選取多張個人圖片，再按「回到示範圖片」恢復。匯入內容僅在目前頁面有效，重新整理即清除。

## 啟動

目前工作目錄已安裝依賴，並準備 SDK、WASM、手勢模型及示範圖片，執行：

```powershell
uv run pro03
```

開啟 **http://localhost:8000**，按「開啟攝影機」並允許網站使用攝影機。亦可使用 `uv run python main.py`。關閉攝影機、切換頁面至背景或離開頁面時，應用程式會停止追蹤並釋放裝置；回到頁面後需自行重新開啟。

新電腦／新檢出環境：

```powershell
uv sync --locked
uv run python scripts/prepare_assets.py
uv run pro03
```

準備資源時需要連網；SDK 與 WASM 依 `package-lock.json` 的版本和 SHA-512 驗證，模型以固定版本 URL 和 `assets-manifest.json` 的 SHA-256 驗證。資源準備完畢後，頁面只從自己的服務讀取資源，不需外部 CDN。

前端測試需 Node.js：

```powershell
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

正式服務不依賴 Node.js。Python 固定為 3.14.7；若不使用 uv，可直接完成正式建置並啟動：

```powershell
python scripts/build_render.py
python -m uvicorn pro03.app:app --app-dir src --host 127.0.0.1 --port 8000
```

## 檔案結構

```text
main.py                            # Python 啟動入口
src/pro03/app.py                   # FastAPI、首頁、靜態檔案與 /healthz
src/pro03/static/index.html         # 左側攝影機與右側圖片版面
src/pro03/static/styles.css         # 響應式版面
src/pro03/static/app.js             # 圖片、像素化、縮放、按鈕與攝影機生命週期
src/pro03/static/gestures.js        # 切圖、翻手、拍手、下折與指尖開合狀態機
src/pro03/static/vision-worker.js   # MediaPipe 模型與影格處理
src/pro03/static/images/            # 五張本機示範圖片
src/pro03/static/vendor/            # 建置時取得的 SDK 與 WASM（不納入 Git）
src/pro03/static/models/            # 建置時取得的 .task 模型（不納入 Git）
scripts/prepare_assets.py           # 資源下載、固定版本及完整性驗證
assets-manifest.json                # 模型雜湊與示範圖片來源
render.yaml                        # Render 部署設定
scripts/build_render.py             # 固定依賴安裝、資源下載與部署檢查
scripts/check_project.py            # 依賴版本與靜態資源完整性檢查
DEPLOYMENT.md                      # GitHub / Render 上線步驟
.github/workflows/ci.yml            # Ubuntu 建置及自動測試
requirements.txt / pyproject.toml   # Python 依賴
package.json / package-lock.json    # SDK 與瀏覽器測試工具依賴
uv.lock                            # Python 完整依賴鎖定
操作說明.md                         # 使用步驟與排除問題
```

## 套件與辨識方式

- Python 3.14.7；FastAPI 0.162.0、Uvicorn 0.54.0。
- MediaPipe Tasks Vision 1.2.0；Gesture Recognizer `float16/1` 模型。
- 開發測試：Playwright 1.64.1；手勢邏輯測試使用 Node.js 內建測試工具。

小指與手掌移動由手部 21 個關鍵點自行判定，不依賴預訓練手勢分類是否提供小指類別。模型最多追蹤兩隻手，並繪出兩組不同顏色的關鍵點。單手翻面透過掌面法向、側面過渡及穩定停留判定；拍手透過雙手掌心距離相對手掌大小的變化、雙向內移及接近速度判定，靜態合掌或單純並排不觸發。追蹤遺失時不推測拍手接觸。

下折使用三維掌骨方向、深度變化及手腕穩定度，區分手腕彎折與單純移動。指尖距離以掌寬正規化，並以手掌局部座標判斷兩指是否共同移動，減少鏡頭遠近或轉動的干擾。雙手拍手優先；單手指尖縮放及下折動作會暫停切圖／翻面，避免一個動作同時產生多種效果。新功能不需要額外安裝套件。

影格約每 80ms 取樣，等待前一張辨識完成才送下一張，避免影格排隊。模型載入、推論逾時或裝置中斷時會釋放攝影機，圖片按鈕仍可使用。

## Render 部署

將專案放入 Git 儲存庫後，在 Render 建立 Blueprint 並選取此儲存庫，使用根目錄 `render.yaml`；也可手動建立 Python Web Service：

- Build Command：`python scripts/build_render.py`
- Start Command：`uvicorn pro03.app:app --app-dir src --host 0.0.0.0 --port $PORT`
- Health Check Path：`/healthz`
- Python 版本：由 `.python-version` 指定 3.14.7。

啟動命令中的 `$PORT` 為 Render Linux 環境使用。建置腳本以 `pip --require-hashes` 安裝完整固定依賴，再準備並驗證資源。`requirements.txt` 由 `uv.lock` 匯出，更新方式見 [部署說明](DEPLOYMENT.md)。務必將示範圖片、模型清單、套件鎖定檔及腳本加入儲存庫；vendor 與模型由建置腳本還原。部署後從 Render HTTPS 網址取得攝影機授權。免費 Web Service 閒置會休眠，重新開啟網站可能需等待喚醒。此版本沒有資料庫或永久上傳儲存需求。

## 驗證範圍

已建立手勢狀態機測試與 Playwright 瀏覽器測試：左右方向、食指／小指停留、防重複觸發、完整圖片操作、匯入圖片、攝影機拒絕授權、真實模型與 WASM 在模擬攝影機下啟動、關閉釋放軌道與手機版面。新增翻面過渡、拍手接近、雙手順序變動、靜態合掌、追蹤遺失與原功能回歸測試；另測試三維下折、指尖開合、像素化 Canvas、縮放上下限、個別圖片狀態與多種效果組合。

自動化驗證使用模擬攝影機與合成關鍵點，不能代替實體攝影機操作。實際辨識率受光線、手部角度、遮擋與裝置效能影響；建議使用新版 Chrome 或 Edge，先在自己的鏡頭前逐一試做上述動作。尚未部署至 Render。

## 來源

- [MediaPipe Web Gesture Recognizer](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js)
- [MediaPipe 模型與手部關鍵點](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer)
- [getUserMedia 攝影機 API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Render Web Services](https://render.com/docs/web-services)、[Python 版本](https://render.com/docs/python-version)、[免費方案限制](https://render.com/docs/free)
- 示範照片來自 Unsplash，個別來源與雜湊記錄於 `assets-manifest.json`；照片已下載至專案，頁面不對外讀取照片。
