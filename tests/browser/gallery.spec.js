import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('desktop gallery: layout, buttons, keyboard, image files and health check', async ({ page, request }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle('手勢映畫 · Gesture Gallery');
  const camera = await page.locator('.camera-panel').boundingBox();
  const gallery = await page.locator('.gallery-panel').boundingBox();
  expect(camera.x).toBeLessThan(gallery.x);
  await expect(page.locator('#first')).toBeDisabled();
  await page.locator('#next').click(); await expect(page.locator('#photo-counter')).toHaveText('02 / 05');
  await page.locator('#last').click(); await expect(page.locator('#photo-counter')).toHaveText('05 / 05');
  await expect(page.locator('#next')).toBeDisabled();
  await page.keyboard.press('Home'); await expect(page.locator('#photo-counter')).toHaveText('01 / 05');
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#photo-counter')).toHaveText('02 / 05');
  await page.locator('.thumbnail').nth(2).click(); await expect(page.locator('#photo-counter')).toHaveText('03 / 05');
  expect(await page.locator('#gallery-image').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect((await request.get('/healthz')).ok()).toBe(true);
  expect((await request.get('/static/vendor/wasm/vision_wasm_internal.wasm')).headers()['content-type']).toContain('application/wasm');
  expect((await request.get('/static/models/gesture_recognizer.task')).ok()).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/gallery-desktop.png', fullPage: true });
});

test('local imports, safe filenames and restoring the collection', async ({ page }) => {
  await page.goto('/');
  const buffer = readFileSync('src/pro03/static/images/alpine.jpg');
  await page.locator('#image-files').setInputFiles([
    { name: '<photo>.jpg', mimeType: 'image/jpeg', buffer },
    { name: 'second.jpg', mimeType: 'image/jpeg', buffer },
  ]);
  await expect(page.locator('#photo-counter')).toHaveText('01 / 02');
  await expect(page.locator('#photo-title')).toHaveText('<photo>');
  await page.locator('#last').click(); await expect(page.locator('#photo-counter')).toHaveText('02 / 02');
  await page.locator('#restore-demo').click(); await expect(page.locator('#photo-counter')).toHaveText('01 / 05');
});

test('camera permission denial leaves gallery controls usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await page.goto('/'); await page.locator('#camera-toggle').click();
  await expect(page.locator('#gesture-feedback')).toContainText('權限未允許');
  await page.locator('#next').click(); await expect(page.locator('#photo-counter')).toHaveText('02 / 05');
});

test('real WASM worker/model starts with a simulated camera and stops its tracks', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const logs = []; page.on('console', message => logs.push(message.text()));
  await page.goto('/'); await page.locator('#camera-toggle').click();
  await expect(page.locator('#camera-status')).toContainText('辨識中', { timeout: 65000 });
  await expect(page.locator('#gesture-feedback')).toContainText('放入畫面', { timeout: 25000 });
  await page.waitForTimeout(2000);
  expect(await page.locator('#camera').evaluate(v => v.srcObject.getTracks()[0].readyState)).toBe('live');
  await page.evaluate(() => { window.testTrack = document.getElementById('camera').srcObject.getTracks()[0]; });
  await page.locator('#camera-toggle').click();
  expect(await page.evaluate(() => window.testTrack.readyState)).toBe('ended');
  await expect(page.locator('#camera-placeholder')).toBeVisible();
  expect(errors, logs.join('\n')).toEqual([]);
});

test('mobile gallery fits the viewport and keeps navigation available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const camera = await page.locator('.camera-panel').boundingBox();
  const gallery = await page.locator('.gallery-panel').boundingBox();
  expect(gallery.y).toBeGreaterThan(camera.y);
  await page.locator('#next').click(); await expect(page.locator('#photo-counter')).toHaveText('02 / 05');
  await page.screenshot({ path: 'artifacts/gallery-mobile.png', fullPage: true });
});

test('synthetic hand landmarks drive all four gallery gestures through the camera loop', async ({ page }) => {
  await page.addInitScript(() => {
    // Isolate gesture integration from the physical camera/model: the real model
    // bootstrap is verified separately above.
    window.hand = null;
    window.Worker = class {
      postMessage(data) {
        if (data.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0);
        if (data.type === 'frame') {
          data.frame.close();
          setTimeout(() => this.onmessage?.({ data: { type: 'result', hands: window.hand ? [{ landmarks: window.hand }] : [], timestamp: data.timestamp } }), 0);
        }
      }
      terminate() { this.onmessage = null; }
    };
  });
  await page.goto('/'); await page.locator('#camera-toggle').click();
  await expect(page.locator('#camera-status')).toContainText('辨識中');
  async function hand(fingers, shift = 0) {
    await page.evaluate(({ fingers, shift }) => {
      const points = Array.from({ length: 21 }, () => ({ x: .5 + shift, y: .9, z: 0 }));
      for (const [finger, base] of [5,9,13,17].entries()) {
        const x = .35 + finger * .1 + shift;
        points[base] = { x, y: .65, z: 0 };
        points[base + 1] = { x, y: .5, z: 0 };
        points[base + 2] = { x, y: fingers[finger] ? .37 : .7, z: 0 };
        points[base + 3] = { x, y: fingers[finger] ? .25 : .8, z: 0 };
      }
      window.hand = points;
    }, { fingers, shift });
  }
  await hand([false,false,false,true]);
  await expect(page.locator('#photo-counter')).toHaveText('05 / 05');
  await page.waitForTimeout(1200);
  await hand([true,false,false,false]);
  await expect(page.locator('#photo-counter')).toHaveText('01 / 05');
  // Holding the finger must not override a manual selection repeatedly.
  await page.locator('.thumbnail').nth(2).click();
  await page.waitForTimeout(1200);
  await expect(page.locator('#photo-counter')).toHaveText('03 / 05');
  await hand([true,true,true,true], .15); await page.waitForTimeout(250);
  await hand([true,true,true,true], -.1);
  await expect(page.locator('#photo-counter')).toHaveText('04 / 05');
  await page.waitForTimeout(1200);
  await hand([true,true,true,true], .15);
  await expect(page.locator('#photo-counter')).toHaveText('03 / 05');
  await page.locator('#camera-toggle').click();
});
