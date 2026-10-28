# GitHub 與 Render 部署

目標儲存庫：[TomLin555/20261028_hand](https://github.com/TomLin555/20261028_hand)。使用 `main` 分支；保留既有 Git 歷史，不使用強制推送。

## 部署所需內容

- Python 固定為 `.python-version` 的 **3.14.7**。
- `requirements.txt` 由 `uv.lock` 產生，包含 14 個正式執行套件的固定版本與 SHA-256。
- 模型推論在瀏覽器執行，因此 Python 不需要 OpenCV、MediaPipe、NumPy 或模型訓練套件。
- 模型、SDK 及 WASM 在建置時下載並驗證；不用把這些大型檔案上傳 GitHub，也不需在 Render 安裝 Node.js。
- 五張示範照片需隨原始碼上傳，來源與雜湊記錄於 `assets-manifest.json`。
- `.venv`、`node_modules`、環境變數檔、快取、測試輸出及下載資源由 `.gitignore` 排除。

## 本機檢查

```powershell
uv sync --locked
uv run python scripts/prepare_assets.py
uv run python scripts/check_project.py --assets
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

依賴更新時，先調整 `pyproject.toml`、更新 `uv.lock` 並測試，再重建清單：

```powershell
uv export --locked --no-dev --no-emit-project --format requirements.txt --output-file requirements.txt
```

不要直接使用 `pip freeze` 覆蓋清單，以免混入開發工具、Windows 本機路徑或未使用的套件。

## Render 設定

1. 在 Render 選擇 New → Blueprint，連結上述 GitHub 儲存庫並選 `main`。
2. 讓 Render 讀取根目錄的 `render.yaml`。若手動建立，選擇 Python Web Service，Root Directory 留空。
3. 使用下表設定後部署。

| 項目 | 值 |
| --- | --- |
| Build Command | `python scripts/build_render.py` |
| Start Command | `uvicorn pro03.app:app --app-dir src --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/healthz` |
| Python | 3.14.7，由 `.python-version` 指定 |
| 計算方案 | Blueprint 預設 `free` |

若曾在 Render 手動設定 `PYTHON_VERSION`，請移除該覆寫或改為 3.14.7，以免優先於 `.python-version`。本專案不需要 API 金鑰、資料庫或持久化磁碟。

建置腳本依序執行固定雜湊的 pip 安裝、SDK／WASM／模型準備、專案與資源完整性檢查。任何步驟失敗都會中止建置，不會繼續啟動缺少資源的版本。

## 上線驗收

1. 開啟 Render 的 HTTPS 網址，確認首頁及五張示範照片可載入。
2. 開啟 `/healthz`，應回傳 `{"status":"ok"}`。
3. 允許攝影機，確認顯示「辨識中」且關鍵點可追蹤。
4. 試做左右切圖、食指／小指、翻面、拍手、下折及指尖開合。
5. 驗證圖片匯入、馬賽克、縮放及所有輔助按鈕；關閉攝影機後仍可操作。
6. 重新整理網頁，確認頁面可再次載入模型。圖片與攝影機影像不會上傳保存。

免費 Web Service 可能因閒置休眠，第一次重新開啟需等待喚醒。實體鏡頭的辨識率需在使用者裝置實測；自動化測試使用模擬攝影機及合成關鍵點。

## GitHub 自動檢查

`.github/workflows/ci.yml` 會在推送 `main` 或建立 Pull Request 時，於 Ubuntu 執行正式建置、依賴一致性檢查、手勢邏輯與 Chromium 瀏覽器測試。工作流程只有儲存庫讀取權限，不會自動發布網站或修改程式碼。

## 參考資料

- [Render FastAPI 部署](https://render.com/docs/deploy-fastapi)
- [Render Python 版本設定](https://render.com/docs/python-version)
- [Render Blueprint 格式](https://render.com/docs/blueprint-spec)
