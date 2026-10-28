import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHand, PalmFoldController, PinchController, InteractionController } from '../src/pro03/static/gestures.js';
import { foldedHand, pinchHand } from './fixtures/effect-hands.js';

const describe = raw => classifyHand(raw.landmarks, raw.worldLandmarks);
const fold = angle => describe(foldedHand(angle));
const pinch = progress => describe(pinchHand(progress));

test('fold descriptors distinguish a bent wrist from translating a flat palm downward', () => {
  assert.ok(fold(0).direction[1] < -.9);
  assert.ok(fold(80).direction[1] > -.3);
  assert.ok(fold(80).direction[2] < -.9);
  assert.equal(fold(80).openFingers, 4);
  const raw = foldedHand(0);
  const moved = raw.landmarks.map(p => ({ ...p, y: p.y + .1 }));
  const hand = classifyHand(moved, moved);
  assert.ok(Math.abs(hand.direction[1] - fold(0).direction[1]) < 1e-6);
});

test('an upright palm followed by a downward wrist fold toggles mosaic once', () => {
  const c = new PalmFoldController(); const events = [];
  for (let t = 0; t <= 2000; t += 100) {
    const angle = t < 400 ? 0 : t < 500 ? 40 : 80;
    const action = c.update(fold(angle), t); if (action) events.push(action);
  }
  assert.deepEqual(events, ['toggleMosaic']);
  for (const t of [2100,2200,2300,2400]) assert.equal(c.update(fold(0), t), null);
  c.update(fold(40),2500);
  c.update(fold(80),2600); c.update(fold(80),2700); c.update(fold(80),2800);
  assert.equal(c.update(fold(80),2900), 'toggleMosaic');
});

test('initial folded palms, rigid downward motion, closed fists and hand loss do not apply mosaic', () => {
  const c = new PalmFoldController();
  for (let t = 0; t < 600; t += 100) assert.equal(c.update(fold(80),t), null);
  c.reset();
  for (let t = 0; t < 600; t += 100) {
    const hand = fold(0); hand.y += t / 3000; hand.wrist.y += t / 3000;
    assert.equal(c.update(hand,t),null);
  }
  c.reset(); c.update(fold(0),0); c.update(fold(0),100); c.update(fold(0),200);
  c.update(null,300);
  for (const t of [400,500,600,700]) assert.equal(c.update(fold(80),t),null);
  c.reset(); c.update(fold(0),0); c.update(fold(0),200);
  const fist = { ...fold(80), openFingers: 0 };
  for (const t of [300,400,500,600]) assert.equal(c.update(fist,t),null);
});

test('pinch ratios are normalized for camera distance and rigid rotation', () => {
  assert.ok(pinch(0).pinchRatio > .9);
  assert.ok(pinch(1).pinchRatio < .35);
  const raw = pinchHand(0);
  const moved = raw.landmarks.map(p => ({ x: p.y * .5 + .1, y: -p.x * .5 + .8, z: p.z * .5 }));
  const hand = classifyHand(moved,moved);
  assert.ok(Math.abs(hand.pinchRatio - pinch(0).pinchRatio) < 1e-6);
  assert.ok(Math.hypot(...hand.pinchThumb.map((value,i) => value - pinch(0).pinchThumb[i])) < 1e-6);
});

test('open-to-closed pinches shrink once and closed-to-open pinches enlarge once', () => {
  const c = new PinchController(); const events = [];
  for (let t = 0; t <= 1600; t += 100) {
    const progress = t < 300 ? 0 : t < 500 ? (t - 200) / 400 : t < 1000 ? 1 : t < 1200 ? 1 - (t - 900) / 400 : 0;
    const action = c.update(pinch(progress),t); if (action) events.push(action);
  }
  assert.deepEqual(events, ['zoomOut','zoomIn']);
});

test('first sight of a closed pinch establishes a baseline without shrinking', () => {
  const c = new PinchController();
  for (const t of [0,100,200,300]) assert.equal(c.update(pinch(1),t),null);
  for (const t of [400,500]) assert.equal(c.update(pinch(0),t),null);
  assert.equal(c.update(pinch(0),600),'zoomIn');
});

test('index-only motion, steady pinches and small jitter do not zoom', () => {
  const c = new PinchController();
  for (const t of [0,100,200]) c.update(pinch(0),t);
  const fakeClose = { ...pinch(1), pinchThumb: pinch(0).pinchThumb };
  for (const t of [300,400,500,600]) assert.equal(c.update(fakeClose,t),null);
  c.reset();
  for (let t = 0; t < 1500; t += 100) assert.equal(c.update(pinch(.02 * Math.sin(t)),t),null);
});

test('pinch tracking loss and opening other fingers reset the interaction', () => {
  const c = new PinchController();
  for (const t of [0,100,200]) c.update(pinch(0),t);
  c.update(pinch(.5),300);
  assert.equal(c.active,true);
  c.update(null,400); assert.equal(c.active,false);
  for (const t of [500,600,700]) assert.equal(c.update(pinch(1),t),null);
  c.update(fold(0),800); assert.equal(c.state,null);
});

test('folding is exclusive with palm flips and navigation; the original index resumes after release', () => {
  const c = new InteractionController(); const events = [];
  for (let t = 0; t <= 1400; t += 100) {
    const angle = t < 400 ? 0 : t < 500 ? 40 : 100;
    const action = c.update([fold(angle)],t); if (action) events.push(action);
  }
  assert.deepEqual(events,['toggleMosaic']);
  for (const t of [1500,1600,1700]) c.update([fold(0)],t);
  // A still index with an unmoving thumb remains the original first-image gesture.
  for (let t = 1800; t <= 2500; t += 100) {
    const action = c.update([pinch(0)],t); if (action) events.push(action);
  }
  assert.deepEqual(events,['toggleMosaic','first']);
});

test('pinch zoom has priority over index navigation and held pinches never navigate', () => {
  const c = new InteractionController(); const events = [];
  for (let t = 0; t <= 2200; t += 100) {
    const progress = t < 300 ? 0 : t < 500 ? .5 : 1;
    const action = c.update([pinch(progress)],t); if (action) events.push(action);
  }
  assert.deepEqual(events,['zoomOut']);
});
