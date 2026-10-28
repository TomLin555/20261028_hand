import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureController, classifyHand, PalmTurnController, ClapController, InteractionController } from '../src/pro03/static/gestures.js';

function landmarks(extended) {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .9, z: 0 }));
  for (const [finger, base] of [5, 9, 13, 17].entries()) {
    const x = .35 + finger * .1;
    points[base] = { x, y: .65, z: 0 };
    points[base + 1] = { x, y: .5, z: 0 };
    points[base + 2] = { x, y: extended[finger] ? .37 : .7, z: 0 };
    points[base + 3] = { x, y: extended[finger] ? .25 : .8, z: 0 };
  }
  return points;
}
test('classifies index-only, pinky-only, open palm and folded fingers', () => {
  for (const [fingers, expected] of [[[true,false,false,false], 'index'], [[false,false,false,true], 'pinky'], [[true,true,true,true], 'palm'], [[false,false,false,false], 'other'], [[true,true,false,false], 'other']]) {
    assert.equal(classifyHand(landmarks(fingers)).pose, expected);
  }
  assert.equal(classifyHand(null), null);
  assert.equal(classifyHand([]), null);
});
test('mirrored display x follows the preview', () => {
  const points = landmarks([true,true,true,true]);
  const left = classifyHand(points).x;
  assert.ok(Math.abs(classifyHand(points.map(p => ({ ...p, x: p.x + .2 }))).x - (left - .2)) < 1e-6);
});
test('index needs a half-second hold and fires only once while held', () => {
  const c = new GestureController();
  const outputs = [];
  for (let t = 0; t <= 4000; t += 100) {
    const action = c.update({ pose: 'index' }, t);
    if (action) outputs.push([t, action]);
  }
  assert.deepEqual(outputs, [[500, 'first']]);
});
test('pinky goes to the last image, not the I Love You gesture', () => {
  const c = new GestureController();
  for (let t = 0; t < 500; t += 100) assert.equal(c.update({ pose: 'pinky' }, t), null);
  assert.equal(c.update({ pose: 'pinky' }, 500), 'last');
});
test('release rearms a static gesture after the cooldown', () => {
  const c = new GestureController(); const events = [];
  for (let t = 0; t <= 2600; t += 100) {
    const pose = t < 800 || t >= 1400 ? 'index' : 'other';
    const action = c.update({ pose }, t); if (action) events.push(action);
  }
  assert.deepEqual(events, ['first', 'first']);
});
test('a mirrored left palm swipe selects previous; right selects next', () => {
  for (const [direction, expected] of [[-1, 'previous'], [1, 'next']]) {
    const c = new GestureController(); const events = [];
    for (let t = 0; t <= 500; t += 50) {
      const action = c.update({ pose: 'palm', x: .5 + direction * t / 1200, y: .5 }, t);
      if (action) events.push(action);
    }
    assert.deepEqual(events, [expected]);
  }
});
test('small jitter, vertical moves, and a stationary palm do not flip images', () => {
  for (const movement of [t => ({ x: .5 + Math.sin(t) * .03, y: .5 }), t => ({ x: .5, y: t / 1000 })]) {
    const c = new GestureController();
    for (let t = 0; t < 2000; t += 50) assert.equal(c.update({ pose: 'palm', ...movement(t) }, t), null);
  }
});
test('hand loss or a long frame gap cannot create a swipe across disconnected detections', () => {
  const c = new GestureController();
  c.update({ pose: 'palm', x: .8, y: .5 }, 0);
  c.update(null, 50);
  assert.equal(c.update({ pose: 'palm', x: .2, y: .5 }, 200), null);
  assert.equal(c.update({ pose: 'palm', x: .8, y: .5 }, 800), null);
});
test('cooldown prevents repeated flips and reset removes prior tracking state', () => {
  const c = new GestureController(); let count = 0;
  for (let t = 0; t < 1000; t += 50) {
    if (c.update({ pose: 'palm', x: .5 + .4 * Math.sin(t / 200), y: .5 }, t)) count++;
  }
  assert.equal(count, 1);
  c.reset(); assert.equal(c.update({ pose: 'palm', x: .9, y: .5 }, 1100), null);
});

const palm = (orientation = 1, x = .5, y = .5) => ({ pose: 'palm', orientation, x, y, size: .15, edgeOn: orientation === 0 });
const pair = (left = .2, right = .8) => [palm(1, left), palm(-1, right)];

test('palm normal changes sign on a front/back reflection and ignores edge-on hands', () => {
  const front = landmarks([true,true,true,true]);
  const back = front.map(p => ({ ...p, x: 1 - p.x }));
  const edge = front.map(p => ({ ...p, x: .5 + (p.x - .5) * .05 }));
  assert.equal(classifyHand(front).orientation, 1);
  assert.equal(classifyHand(back).orientation, -1);
  assert.equal(classifyHand(edge).orientation, 0);
  // World-space normal catches side-facing palms despite a noisy 2D outline.
  const sideWorld = front.map(p => ({ ...p, z: p.x * 10 }));
  assert.equal(classifyHand(front, sideWorld).orientation, 0);
});

test('palm/back turn requires a baseline, an edge transition and stable opposite face', () => {
  const c = new PalmTurnController(), actions = [];
  for (let t = 0; t <= 1400; t += 100) {
    const orientation = t < 300 ? 1 : t < 400 ? 0 : -1;
    const action = c.update(palm(orientation), t); if (action) actions.push([t, action]);
  }
  assert.deepEqual(actions, [[600, 'flipHorizontal']]);
  assert.equal(c.update(palm(0), 1500), null);
  for (const t of [1600,1700]) assert.equal(c.update(palm(1), t), null);
  assert.equal(c.update(palm(1), 1800), 'flipHorizontal');
});

test('orientation jitter, initial back-facing palms, hand loss and replacement do not flip', () => {
  const c = new PalmTurnController();
  for (const t of [0,100,200]) assert.equal(c.update(palm(-1), t), null);
  // A direct sign jump without passing the side is not a turn.
  for (const t of [300,400,500]) assert.equal(c.update(palm(1), t), null);
  c.update(palm(0), 600); c.update(null, 700);
  for (const t of [800,900,1000]) assert.equal(c.update(palm(-1), t), null);
  c.update(palm(0), 1100);
  for (const t of [1200,1300,1400]) assert.equal(c.update(palm(1, .9), t), null);
});

test('original index and pinky holds still work immediately after an open palm', () => {
  for (const [pose, expected] of [['index','first'], ['pinky','last']]) {
    const c = new InteractionController(); const actions = [];
    for (let t = 0; t < 1000; t += 100) {
      const hand = t < 300 ? palm() : { ...palm(0), pose, edgeOn: false };
      const action = c.update([hand], t); if (action) actions.push(action);
    }
    assert.deepEqual(actions, [expected]);
  }
});

test('original mirrored swipes pass through the interaction controller unchanged', () => {
  for (const [direction, expected] of [[-1,'previous'], [1,'next']]) {
    const c = new InteractionController(); const actions = [];
    for (let t = 0; t <= 500; t += 50) {
      const action = c.update([palm(1, .5 + direction * t / 1200)], t); if (action) actions.push(action);
    }
    assert.deepEqual(actions, [expected]);
  }
});

test('a clap is separated hands moving inward, independent of detector ordering', () => {
  const c = new ClapController();
  assert.equal(c.update(pair(), 0), null);
  assert.equal(c.update(pair(.3,.7).reverse(), 100), null);
  assert.equal(c.update(pair(.38,.62), 200), null);
  assert.equal(c.update(pair(.44,.56).reverse(), 300), 'flipVertical');
  for (let t = 400; t < 1800; t += 100) assert.equal(c.update(pair(.44,.56), t), null);
  // Hands must separate again before the next clap.
  assert.equal(c.update(pair(), 1800), null);
  assert.equal(c.update(pair(.38,.62), 1900), null);
  assert.equal(c.update(pair(.44,.56), 2000), 'flipVertical');
});

test('touching hands, one hand, static neighbours and lost detections do not clap', () => {
  const c = new ClapController();
  for (let t = 0; t < 1000; t += 100) assert.equal(c.update(pair(.44,.56), t), null);
  c.update(pair(), 1100); c.update([palm()], 1200);
  assert.equal(c.update(pair(.44,.56), 1300), null);
  c.reset(); c.update(pair(), 0);
  assert.equal(c.update(pair(.44,.56), 500), null); // frame gap resets the approach
});

test('moving together, a stationary hand, slow convergence and vertical crossings do not clap', () => {
  const cases = [
    [[0,pair()], [100,pair(.3,.9)], [200,pair(.4,1)]],
    [[0,pair()], [100,pair(.4,.8)], [200,pair(.7,.8)]],
    Array.from({length:45}, (_,i) => [i*100, pair(.2 + i*.005, .8 - i*.005)]),
    [[0,pair()], [100,[palm(1,.4,.2),palm(-1,.6,.8)]], [200,[palm(1,.45,.2),palm(-1,.55,.8)]]],
  ];
  for (const frames of cases) {
    const c = new ClapController();
    for (const [t,hands] of frames) assert.equal(c.update(hands,t), null);
  }
});

test('clap frames never navigate, and one-hand contact occlusion is guarded', () => {
  const c = new InteractionController();
  assert.equal(c.update(pair(),0),null);
  assert.equal(c.update(pair(.3,.7),100),null);
  assert.equal(c.update(pair(.44,.56),200),'flipVertical');
  assert.equal(c.update([palm(1,.1)],300),null);
  assert.equal(c.update([palm(1,.8)],400),null);
  c.reset();
  assert.equal(c.update(pair(.44,.56),500),null);
});
