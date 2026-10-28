import { test, expect } from '@playwright/test';
import { foldedHand, pinchHand } from '../fixtures/effect-hands.js';

async function simulatedHands(page) {
  await page.addInitScript(() => {
    window.hands = [];
    window.Worker = class {
      postMessage(data) {
        if (data.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0);
        else if (data.type === 'frame') {
          data.frame.close();
          setTimeout(() => this.onmessage?.({ data: { type: 'result', hands: window.hands, timestamp: data.timestamp } }), 0);
        }
      }
      terminate() { this.onmessage = null; }
    };
  });
  await page.goto('/'); await page.locator('#camera-toggle').click();
  await expect(page.locator('#camera-status')).toContainText('辨識中');
  await page.locator('.thumbnail').nth(2).click();
}
async function hand(page, data, delay = 250) {
  await page.evaluate(data => { window.hands = data ? [data] : []; }, data);
  await page.waitForTimeout(delay);
}

test('mosaic is a real pixel bitmap, composes with flips and zoom, and persists per image', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#gallery-image')).toHaveJSProperty('complete',true);
  await page.locator('#toggle-mosaic').click();
  const canvas = page.locator('#gallery-mosaic');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS('image-rendering','pixelated');
  expect(await canvas.evaluate(c => c.width <= 48 && c.height <= 48 && c.getContext('2d').getImageData(0,0,1,1).data[3] === 255)).toBe(true);
  await page.locator('#flip-horizontal').click();
  await page.locator('#zoom-out').click();
  await expect(page.locator('#zoom-level')).toHaveText('80%');
  await expect(page.locator('#gallery-image')).toHaveCSS('transform','matrix(-0.8, 0, 0, 0.8, 0, 0)');
  await expect(canvas).toHaveCSS('transform','matrix(-0.8, 0, 0, 0.8, 0, 0)');
  await page.locator('#next').click();
  await expect(canvas).toBeHidden(); await expect(page.locator('#zoom-level')).toHaveText('100%');
  await page.locator('#previous').click();
  await expect(canvas).toBeVisible(); await expect(page.locator('#zoom-level')).toHaveText('80%');
  await page.locator('#reset-orientation').click();
  await expect(canvas).toBeVisible(); await expect(page.locator('#zoom-level')).toHaveText('80%');
  await expect(page.locator('#flip-horizontal')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#photo-counter')).toHaveText('01 / 05');
  await page.locator('#toggle-mosaic').click(); await expect(canvas).toBeHidden();
  await page.locator('#reset-zoom').click(); await expect(page.locator('#zoom-level')).toHaveText('100%');
  expect(errors).toEqual([]);
});

test('zoom controls stop at 50 and 200 percent and work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (let n = 0; n < 12 && await page.locator('#zoom-in').isEnabled(); n++) await page.locator('#zoom-in').click();
  await expect(page.locator('#zoom-level')).toHaveText('200%');
  await expect(page.locator('#zoom-in')).toBeDisabled();
  for (let n = 0; n < 15 && await page.locator('#zoom-out').isEnabled(); n++) await page.locator('#zoom-out').click();
  await expect(page.locator('#zoom-level')).toHaveText('50%');
  await expect(page.locator('#zoom-out')).toBeDisabled();
  await page.locator('#toggle-mosaic').click(); await expect(page.locator('#gallery-mosaic')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#reset-zoom').click(); await expect(page.locator('#zoom-level')).toHaveText('100%');
});

test('a downward wrist fold toggles mosaic without flipping or changing the current slide', async ({ page }) => {
  await simulatedHands(page);
  await hand(page,foldedHand(0),400);
  await hand(page,foldedHand(40),180);
  await hand(page,foldedHand(80),450);
  await expect(page.locator('#toggle-mosaic')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#gallery-mosaic')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.locator('#toggle-mosaic')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#flip-horizontal')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#flip-vertical')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#photo-counter')).toHaveText('03 / 05');
  await hand(page,foldedHand(0),450);
  await hand(page,foldedHand(40),180);
  await hand(page,foldedHand(80),450);
  await expect(page.locator('#toggle-mosaic')).toHaveAttribute('aria-pressed','false');
  await page.locator('#camera-toggle').click();
});

test('pinching shrinks and separating enlarges without invoking the original index shortcut', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await simulatedHands(page);
  await hand(page,pinchHand(0),280);
  await hand(page,pinchHand(.4),200);
  await hand(page,pinchHand(1),400);
  await expect(page.locator('#zoom-level')).toHaveText('80%');
  await page.waitForTimeout(1000);
  await expect(page.locator('#zoom-level')).toHaveText('80%');
  await expect(page.locator('#photo-counter')).toHaveText('03 / 05');
  await hand(page,pinchHand(.6),180);
  await hand(page,pinchHand(0),400);
  await expect(page.locator('#zoom-level')).toHaveText('100%');
  await page.waitForTimeout(800);
  await expect(page.locator('#photo-counter')).toHaveText('03 / 05');
  await page.locator('#camera-toggle').click();
  expect(errors).toEqual([]);
});
