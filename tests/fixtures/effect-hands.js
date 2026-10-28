// Synthetic landmark trajectories with known wrist angles and fingertip gaps.
function baseHand(open = true) {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .9, z: 0 }));
  for (const [finger, base] of [5,9,13,17].entries()) {
    const x = .35 + finger * .1;
    for (const [offset, y] of [.65,.5,open || finger === 0 ? .37 : .7,open || finger === 0 ? .25 : .8].entries()) {
      points[base + offset] = { x, y, z: 0 };
    }
  }
  return points;
}

export function foldedHand(degrees = 0) {
  const angle = degrees * Math.PI / 180;
  const points = baseHand().map(p => ({ x: p.x, y: .9 + (p.y - .9) * Math.cos(angle), z: (p.y - .9) * Math.sin(angle) }));
  return { landmarks: points, worldLandmarks: points };
}

// progress=0 is a C shape; progress=1 has thumb and index touching.
export function pinchHand(progress = 0) {
  const points = baseHand(false);
  points[4] = { x: .1 + .21 * progress, y: .38 + .02 * progress, z: 0 };
  points[8] = { x: .55 - .21 * progress, y: .25 + .15 * progress, z: 0 };
  return { landmarks: points, worldLandmarks: points };
}
