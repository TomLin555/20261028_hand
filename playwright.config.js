import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 90000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8000', viewport: { width: 1440, height: 1080 },
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  webServer: { command: 'uv run pro03', url: 'http://127.0.0.1:8000/healthz', reuseExistingServer: false, timeout: 30000 },
});
