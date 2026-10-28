import { test, expect } from '@playwright/test';

// Open hand with a controllable palm normal and screen-space centre.
function openHand(x = .5, facing = 1, scale = 1) {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .9, z: 0 }));
  for (const [finger, base] of [5,9,13,17].entries()) {
    const px = .35 + finger * .1;
    for (const [offset, y] of [.65,.5,.37,.25].entries()) points[base + offset] = { x: px, y, z: 0 };
  }
  return { landmarks: points.map(p => ({ x: 1 - x + (p.x - .5) * scale * facing, y: .5 + (p.y - .7) * scale, z: 0 })) };
}

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
}
async function setHands(page, hands, wait = 250) {
  await page.evaluate(hands => { window.hands = hands; }, hands);
  await page.waitForTimeout(wait);
}

test('flip controls compose, toggle and restore only the current image', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#reset-orientation')).toBeDisabled();
  await page.locator('#flip-horizontal').click();
  await expect(page.locator('#gallery-image')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await page.locator('#flip-vertical').click();
  await expect(page.locator('#gallery-image')).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
  await expect(page.locator('#photo-title')).toHaveText('山湖之間');
  await expect(page.locator('#photo-counter')).toHaveText('01 / 05');
  await page.locator('#next').click();
  await expect(page.locator('#gallery-image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(page.locator('#flip-horizontal')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#previous').click();
  await expect(page.locator('#flip-horizontal')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#flip-vertical')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#reset-orientation').click();
  await expect(page.locator('#gallery-image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(page.locator('#orientation-status')).toHaveText('原始方向');
});

test('palm/back turns and repeated claps flip the photo without navigating', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await simulatedHands(page);
  await page.locator('.thumbnail').nth(2).click();
  await setHands(page, [openHand()], 400);
  await expect(page.locator('#flip-horizontal')).toHaveAttribute('aria-pressed','false');
  await setHands(page, [openHand(.5, .03)], 200);
  await setHands(page, [openHand(.5, -1)], 400);
  await expect(page.locator('#flip-horizontal')).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(1200);
  await expect(page.locator('#flip-horizontal')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#photo-counter')).toHaveText('03 / 05');

  async function clap() {
    await setHands(page, [openHand(.15,1,.48),openHand(.85,1,.48)], 250);
    await setHands(page, [openHand(.3,1,.48),openHand(.7,1,.48)], 200);
    await setHands(page, [openHand(.4,1,.48),openHand(.6,1,.48)], 150);
    await setHands(page, [openHand(.54,1,.48),openHand(.46,1,.48)], 200);
  }
  await clap();
  await expect(page.locator('#flip-vertical')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#gallery-image')).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
  await page.waitForTimeout(1200);
  await expect(page.locator('#flip-vertical')).toHaveAttribute('aria-pressed','true');
  await clap();
  await expect(page.locator('#flip-vertical')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#photo-counter')).toHaveText('03 / 05');
  await expect(page.locator('#flip-horizontal')).toHaveAttribute('aria-pressed','true');
  await page.locator('#camera-toggle').click();
  expect(errors).toEqual([]);
});

test('flip controls are usable on mobile and respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#flip-vertical').click();
  await expect(page.locator('#gallery-image')).toHaveCSS('transform', 'matrix(1, 0, 0, -1, 0, 0)');
  await expect(page.locator('#gallery-image')).toHaveCSS('transition-duration', '0s');
  await page.locator('#next').click(); await expect(page.locator('#photo-counter')).toHaveText('02 / 05');
});
