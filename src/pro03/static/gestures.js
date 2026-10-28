// Pure geometry/state logic: timestamps are monotonic milliseconds.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

export function fingerExtended(points, mcp, pip, dip, tip) {
  const a = points[mcp], b = points[pip], c = points[tip];
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const size = Math.hypot(...u) * Math.hypot(...v);
  if (!size) return false;
  const cosine = u.reduce((sum, value, i) => sum + value * v[i], 0) / size;
  return cosine < -0.75 && distance(c, points[0]) > distance(b, points[0]) * 1.12
    && distance(points[dip], points[0]) > distance(a, points[0]);
}

export function classifyHand(points, worldPoints) {
  if (!points || points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const fingers = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
    .map(ids => fingerExtended(points, ...ids));
  const [index, middle, ring, pinky] = fingers;
  let pose = 'other';
  if (index && !middle && !ring && !pinky) pose = 'index';
  else if (pinky && !index && !middle && !ring) pose = 'pinky';
  else if (fingers.every(Boolean)) pose = 'palm';
  const palm = [0, 5, 9, 13, 17].map(i => points[i]);
  const size = Math.hypot(points[9].x - points[0].x, points[9].y - points[0].y);
  const u = { x: points[5].x - points[0].x, y: points[5].y - points[0].y };
  const v = { x: points[17].x - points[0].x, y: points[17].y - points[0].y };
  const area = u.x * v.y - u.y * v.x;
  // The signed palm normal reverses on a palm/back turn, but not on an
  // in-plane rotation. Ignore narrow edge-on projections and uncertain poses.
  let facingCamera = true;
  if (worldPoints?.length === 21) {
    const [a, b, c] = [worldPoints[0], worldPoints[5], worldPoints[17]];
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    facingCamera = Math.abs(nz) / Math.hypot(nx, ny, nz) >= 0.4;
  }
  const edgeOn = !facingCamera || size < 0.04 || Math.abs(area) / (size * size) < 0.22;
  const orientation = pose === 'palm' && !edgeOn ? Math.sign(area) : 0;
  const geometry = worldPoints?.length === 21 ? worldPoints : points;
  const vector = (a, b) => [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)];
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const forward = vector(geometry[0], geometry[9]);
  const length = Math.hypot(...forward);
  const direction = length > 1e-6 ? forward.map(value => value / length) : [0, 0, 0];
  const across = vector(geometry[5], geometry[17]);
  const width = Math.hypot(...across);
  // Palm-local coordinates make fingertip motion independent of translation,
  // camera distance and rigid hand rotations. A pointing finger alone must
  // never be mistaken for the two-finger pinch gesture.
  const ex = width > 1e-6 ? across.map(value => value / width) : [0, 0, 0];
  const projected = dot(direction, ex);
  const remaining = direction.map((value, i) => value - projected * ex[i]);
  const remainingLength = Math.hypot(...remaining);
  const ey = remainingLength > 1e-6 ? remaining.map(value => value / remainingLength) : [0, 0, 0];
  const ez = [ex[1]*ey[2] - ex[2]*ey[1], ex[2]*ey[0] - ex[0]*ey[2], ex[0]*ey[1] - ex[1]*ey[0]];
  const localTip = index => {
    const tip = vector(geometry[0], geometry[index]);
    return [dot(tip, ex), dot(tip, ey), dot(tip, ez)].map(value => value / length);
  };
  const pinchEligible = !middle && !ring && !pinky && length > 1e-6 && width > 1e-6 && remainingLength > .1;
  // The video and overlay are mirrored, so display-space x is 1 - model x.
  return { pose, x: 1 - palm.reduce((n, p) => n + p.x, 0) / palm.length,
    y: palm.reduce((n, p) => n + p.y, 0) / palm.length, size, orientation, edgeOn,
    openFingers: fingers.filter(Boolean).length, direction,
    wrist: { x: 1 - points[0].x, y: points[0].y },
    pinchEligible, pinchRatio: width > 1e-6 ? distance(geometry[4], geometry[8]) / width : null,
    pinchThumb: pinchEligible ? localTip(4) : null, pinchIndex: pinchEligible ? localTip(8) : null };
}

export class GestureController {
  constructor() { this.reset(); }
  reset() {
    this.history = []; this.holdPose = null; this.holdSince = 0;
    this.latched = null; this.releaseSince = null; this.lastAction = -Infinity;
    this.lastSeen = null;
  }
  update(hand, now) {
    if (this.lastSeen !== null && now - this.lastSeen > 300) {
      this.history = []; this.holdPose = null; this.releaseSince = null;
    }
    this.lastSeen = now;
    const pose = hand?.pose ?? 'none';
    // A held index/pinky fires once; 250 ms of another pose rearms it.
    if (pose !== this.latched) {
      this.releaseSince ??= now;
      if (now - this.releaseSince >= 250) this.latched = null;
    } else this.releaseSince = null;
    if (pose !== 'palm') this.history = [];
    if (pose !== this.holdPose) { this.holdPose = pose; this.holdSince = now; }
    if (now - this.lastAction < 1000) { this.history = []; this.holdSince = now; return null; }
    let action = null;
    if ((pose === 'index' || pose === 'pinky') && this.latched !== pose && now - this.holdSince >= 500) {
      action = pose === 'index' ? 'first' : 'last'; this.latched = pose;
    }
    if (pose === 'palm') {
      this.history = this.history.filter(point => now - point.time <= 650);
      this.history.push({ x: hand.x, y: hand.y, time: now });
      const start = this.history[0], elapsed = now - start.time;
      const dx = hand.x - start.x, dy = hand.y - start.y;
      if (elapsed >= 120 && Math.abs(dx) >= 0.18 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        action = dx < 0 ? 'previous' : 'next';
      }
    }
    if (action) { this.lastAction = now; this.history = []; this.holdSince = now; }
    return action;
  }
}

export class PalmTurnController {
  constructor() { this.reset(); }
  reset() {
    this.face = null; this.candidate = null; this.candidateSince = 0;
    this.turnStarted = null; this.lastHand = null; this.lastAction = -Infinity;
  }
  get turning() { return this.turnStarted !== null; }
  update(hand, now) {
    if (!hand || (this.lastHand && (now - this.lastHand.time > 300
      || Math.hypot(hand.x - this.lastHand.x, hand.y - this.lastHand.y) > 0.25))) {
      const lastAction = this.lastAction;
      this.reset(); this.lastAction = lastAction;
      if (!hand) return null;
    }
    this.lastHand = { x: hand.x, y: hand.y, time: now };
    if (hand.pose === 'index' || hand.pose === 'pinky' || (hand.pose !== 'palm' && !hand.edgeOn)) {
      this.candidate = null; this.turnStarted = null; return null;
    }
    if (this.turnStarted !== null && now - this.turnStarted > 1500) {
      this.face = null; this.candidate = null; this.turnStarted = null;
    }
    const face = hand.orientation || 0;
    if (!face) {
      this.candidate = null;
      if (this.face !== null) this.turnStarted ??= now;
      return null;
    }
    if (face === this.face) {
      this.candidate = null; this.turnStarted = null; return null;
    }
    if (this.candidate !== face) { this.candidate = face; this.candidateSince = now; }
    if (now - this.candidateSince < 180) return null;
    const flipped = this.face !== null && this.turnStarted !== null && now - this.lastAction >= 1000;
    this.face = face; this.candidate = null; this.turnStarted = null;
    if (flipped) { this.lastAction = now; return 'flipHorizontal'; }
    return null;
  }
}

export class ClapController {
  constructor() { this.reset(); }
  reset() { this.start = null; this.lastSeen = null; this.latched = false; this.lastAction = -Infinity; }
  update(hands, now) {
    if (hands.length !== 2) { this.start = null; this.lastSeen = null; return null; }
    if (this.lastSeen !== null && now - this.lastSeen > 300) this.start = null;
    this.lastSeen = now;
    // Sort by screen position, independent of MediaPipe's per-frame hand order.
    const [left, right] = [...hands].sort((a, b) => a.x - b.x);
    const size = (left.size + right.size) / 2;
    if (!Number.isFinite(size) || size < 0.04) { this.start = null; return null; }
    const gap = Math.hypot(right.x - left.x, right.y - left.y);
    const aligned = Math.abs(right.y - left.y) <= size * 1.3;
    if (gap / size >= 2.4 && aligned && hands.every(hand => hand.pose === 'palm')) {
      if (now - this.lastAction >= 1000) {
        this.latched = false;
        this.start = { left: left.x, right: right.x, gap, size, time: now };
      }
      return null;
    }
    if (!this.start || this.latched || now - this.lastAction < 1000) return null;
    const elapsed = now - this.start.time;
    if (elapsed > 1200) { this.start = null; return null; }
    const scale = (size + this.start.size) / 2;
    const closed = (this.start.gap - gap) / scale;
    const bothMovingIn = left.x - this.start.left > scale * 0.15
      && this.start.right - right.x > scale * 0.15;
    if (elapsed >= 80 && aligned && gap / scale <= 1.2 && closed >= 0.9
      && closed / (elapsed / 1000) >= 1 && bothMovingIn) {
      this.latched = true; this.lastAction = now; this.start = null;
      return 'flipVertical';
    }
    return null;
  }
}

export class PalmFoldController {
  constructor() { this.reset(); }
  reset() {
    this.baseline = null; this.uprightSince = null; this.depthSeen = false;
    this.candidateSince = null; this.latched = false; this.busy = false;
    this.lastHand = null;
  }
  update(hand, now) {
    if (!hand || !hand.direction || (this.lastHand && (now - this.lastHand.time > 300
      || Math.hypot(hand.x - this.lastHand.x, hand.y - this.lastHand.y) > .25))) {
      this.reset();
      if (!hand?.direction) return null;
    }
    this.lastHand = { x: hand.x, y: hand.y, time: now };
    if (hand.openFingers < 3) { this.reset(); return null; }
    const [dx, dy, dz] = hand.direction;
    const upright = dy < -.75 && Math.abs(dz) < .5;
    if (upright) {
      this.uprightSince ??= now;
      if (now - this.uprightSince >= 200) {
        this.baseline = { direction: hand.direction, wrist: hand.wrist, time: now };
        this.depthSeen = false; this.latched = false; this.busy = false; this.candidateSince = null;
      }
      return null;
    }
    this.uprightSince = null;
    if (!this.baseline) return null;
    const wristShift = Math.hypot(hand.wrist.x - this.baseline.wrist.x, hand.wrist.y - this.baseline.wrist.y);
    if (wristShift > Math.max(.1, hand.size * .85) || now - this.baseline.time > 2500 && !this.latched) {
      this.reset(); return null;
    }
    const alignment = dx * this.baseline.direction[0] + dy * this.baseline.direction[1] + dz * this.baseline.direction[2];
    if (Math.abs(dz - this.baseline.direction[2]) > .4 && alignment < .87) this.depthSeen = true;
    this.busy = this.latched || this.depthSeen;
    const folded = this.depthSeen && dy > -.45 && alignment < .57;
    if (!folded || this.latched) { this.candidateSince = null; return null; }
    this.candidateSince ??= now;
    if (now - this.candidateSince < 220) return null;
    this.latched = true; this.busy = true;
    return 'toggleMosaic';
  }
}

const tipMovement = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
export class PinchController {
  constructor() { this.reset(); }
  reset() {
    this.state = null; this.endpoint = null; this.candidate = null; this.candidateSince = 0;
    this.transitionSince = null; this.active = false; this.lastHand = null;
  }
  update(hand, now) {
    if (!hand?.pinchEligible || (this.lastHand && (now - this.lastHand.time > 300
      || Math.hypot(hand.x - this.lastHand.x, hand.y - this.lastHand.y) > .25))) {
      this.reset();
      if (!hand?.pinchEligible) return null;
    }
    this.lastHand = { x: hand.x, y: hand.y, time: now };
    const target = hand.pinchRatio <= .35 ? 'closed' : hand.pinchRatio >= .9 ? 'open' : null;
    let thumbMotion = 0, indexMotion = 0;
    if (this.endpoint) {
      thumbMotion = tipMovement(hand.pinchThumb, this.endpoint.thumb);
      indexMotion = tipMovement(hand.pinchIndex, this.endpoint.index);
      const ratioChange = Math.abs(hand.pinchRatio - this.endpoint.ratio);
      if (ratioChange > .15) this.transitionSince ??= now;
      if (ratioChange > .2 && thumbMotion >= .08 && indexMotion >= .12) this.active = true;
    }
    if (!target) { this.candidate = null; return null; }
    if (target !== this.candidate) { this.candidate = target; this.candidateSince = now; }
    if (now - this.candidateSince < 140) return null;
    if (target === this.state) return null;
    const intentional = this.state !== null && this.transitionSince !== null
      && now - this.transitionSince <= 2200 && thumbMotion >= .12 && indexMotion >= .18;
    this.state = target;
    this.endpoint = { thumb: hand.pinchThumb, index: hand.pinchIndex, ratio: hand.pinchRatio };
    this.transitionSince = null;
    if (intentional) { this.active = true; return target === 'closed' ? 'zoomOut' : 'zoomIn'; }
    return null;
  }
}

// Single-hand navigation is unchanged. Two-hand frames are reserved for a
// clap, with a short grace period for contact occlusion to avoid a stray swipe.
export class InteractionController {
  constructor() {
    this.navigation = new GestureController(); this.turn = new PalmTurnController();
    this.clap = new ClapController(); this.fold = new PalmFoldController(); this.pinch = new PinchController(); this.reset();
  }
  reset() {
    this.navigation.reset(); this.turn.reset(); this.clap.reset(); this.lastDual = -Infinity;
    this.fold.reset(); this.pinch.reset();
  }
  update(hands, now) {
    const clapAction = this.clap.update(hands, now);
    if (hands.length === 2) {
      this.lastDual = now; this.navigation.reset(); this.turn.reset(); this.fold.reset(); this.pinch.reset(); return clapAction;
    }
    if (now - this.lastDual < 500) { this.navigation.reset(); this.turn.reset(); this.fold.reset(); this.pinch.reset(); return null; }
    const hand = hands[0] ?? null;
    const pinchAction = this.pinch.update(hand, now);
    if (pinchAction || this.pinch.active) { this.navigation.reset(); this.turn.reset(); this.fold.reset(); return pinchAction; }
    const foldAction = this.fold.update(hand, now);
    if (foldAction || this.fold.busy) { this.navigation.reset(); this.turn.reset(); return foldAction; }
    const turnAction = this.turn.update(hand, now);
    if (turnAction || this.turn.turning) { this.navigation.reset(); return turnAction; }
    return this.navigation.update(hand, now);
  }
}
