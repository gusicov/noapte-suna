// Shared between the browser client and the Node server.
export const HX = 30, HZ = 20;          // arena half-size
export const PR = 0.6;                  // player radius
export const SPEED = 9;                 // player run speed (units / s)
export const HOSE_R = 2.6;              // radius of the giant hose
export const PLAYER_H = 1.8;

export const BAMBA = {
  home: { x: 25, z: 0 },
  aggro: 10,      // gets angry when someone comes this close while lurking
  eat: 2.6,       // bite distance (from his snout)
  escape: 28,     // "half the map" – target is safe beyond this
  fastT: 2,       // seconds at full player speed
  maxT: 10,       // gives up completely after this long
  sitT: 5,        // minimum rest on his butt
  retarget: 24,   // after resting he goes for the nearest player within this range
};

export const CHARS = [
  { id: 'gusi',   name: 'Gusi',   tag: 'Șmecherul. Alunecă pe parchet cu mâinile în buzunare.' },
  { id: 'aourel', name: 'Aourel', tag: 'Cap mare, pași mici. Se clatină, dar nu cade (de obicei).' },
  { id: 'sunyk',  name: 'Sunyk',  tag: 'Un picior cu față. Sare. Atât.' },
  { id: 'gluga',  name: 'Paul',   tag: 'Dubios din fire. Se furișează repede și se uită peste umăr.' },
];

// --- the knotted hose -------------------------------------------------------
const CP = [
  [-22, 2.6, 13], [-12, 2.6, 10], [-1, 2.6, 5], [9, 2.6, -2], [11, 6.4, -10],
  [3, 2.6, -14], [-5, 2.6, -8], [-3, 6.5, 0], [3, 8.3, 8], [10, 5, 12], [19, 2.6, 14],
];

function cr(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

export function hosePoint(u) {
  const n = CP.length - 1;
  const f = Math.min(Math.max(u, 0), 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const t = f - i;
  const p0 = CP[Math.max(i - 1, 0)], p1 = CP[i], p2 = CP[i + 1], p3 = CP[Math.min(i + 2, n)];
  return {
    x: cr(p0[0], p1[0], p2[0], p3[0], t),
    y: Math.max(HOSE_R, cr(p0[1], p1[1], p2[1], p3[1], t)),
    z: cr(p0[2], p1[2], p2[2], p3[2], t),
  };
}

// circles on the floor that block walking (where the hose is low enough)
export const BLOCKS = [];
for (let i = 0; i <= 260; i++) {
  const p = hosePoint(i / 260);
  const lift = Math.max(0, p.y - PLAYER_H - 0.3);
  const r2 = HOSE_R * HOSE_R - lift * lift;
  if (r2 > 0.3) BLOCKS.push({ x: p.x, z: p.z, r: Math.sqrt(r2) * 0.92 });
}

export function collide(p, radius = PR) {
  for (let k = 0; k < 2; k++) {
    for (const b of BLOCKS) {
      const dx = p.x - b.x, dz = p.z - b.z, min = b.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001;
        p.x = b.x + (dx / d) * min;
        p.z = b.z + (dz / d) * min;
      }
    }
  }
  p.x = Math.min(HX - radius, Math.max(-HX + radius, p.x));
  p.z = Math.min(HZ - radius, Math.max(-HZ + radius, p.z));
  return p;
}

export const SPAWNS = [
  { x: -25, z: -14 }, { x: -9, z: -16 }, { x: -26, z: 2 }, { x: -6, z: 16 },
];

// --- level 2: the obstacle course ("Cursa") ----------------------------------
// Runs along -Z. Everything that moves is a pure function of the race time `t`
// so every client (and the server) sees the same thing.
export const C = {
  startZ: -3, finishZ: -166, finishY: 6, killY: -14,
  pads: [ // static platforms: centre x/z, width, depth, top y
    { x: 0, z: -4, w: 18, d: 12, y: 0, col: 0xff6fb5 },                 // start
    { x: 0, z: -61, w: 14, d: 8, y: 0, col: 0x5ee6b0, cp: 1 },
    { x: 0, z: -80, w: 4.6, d: 30, y: 0, col: 0x8a7dff },               // the bridge
    { x: 0, z: -99, w: 14, d: 8, y: 0, col: 0x5ee6b0, cp: 2 },
    { x: 0, z: -128, w: 14, d: 8, y: 0, col: 0x5ee6b0, cp: 3 },
    { x: 0, z: -181, w: 18, d: 38, y: 6, col: 0xffc93c, cp: 4 },        // finish
  ],
  disc: { x: 0, z: -21, r: 10.6, bar: 9.6, speed: 1.5 },
  movers: [{ z: -36.5, ph: 0, sp: 1.1 }, { z: -44.5, ph: 2.1, sp: 1.4 }, { z: -52.5, ph: 4.2, sp: 1.2 }],
  moverW: 7.5, moverD: 6, moverAmp: 4.5,
  pistons: [{ z: -71, ph: 0 }, { z: -80, ph: 2.2 }, { z: -89, ph: 4.1 }],
  pistonW: 3.2, pistonD: 3, pistonH: 2.6, pistonAmp: 7.5, pistonSp: 1.5,
  tiles: { cols: 4, rows: 6, size: 3.5, z0: -103, period: 3.4, on: 0.62 },
  ramp: { z0: -132, z1: -162, w: 12, h: 6 },
  ball: { r: 1.5, every: 1.5, speed: 11 },
};
const frac = (v) => v - Math.floor(v);
export const moverX = (i, t) => Math.sin(t * C.movers[i].sp + C.movers[i].ph) * C.moverAmp;
export const moverVx = (i, t) => Math.cos(t * C.movers[i].sp + C.movers[i].ph) * C.moverAmp * C.movers[i].sp;
export const pistonX = (i, t) => Math.sin(t * C.pistonSp + C.pistons[i].ph) * C.pistonAmp;
export const pistonVx = (i, t) => Math.cos(t * C.pistonSp + C.pistons[i].ph) * C.pistonAmp * C.pistonSp;
export const discAngle = (t) => t * C.disc.speed;
export const tilePhase = (c, r, t) => frac(t / C.tiles.period + c * 0.37 + r * 0.61); // solid while < C.tiles.on
export const tileX = (c) => (c - (C.tiles.cols - 1) / 2) * C.tiles.size;
export const tileZ = (r) => C.tiles.z0 - (r + 0.5) * C.tiles.size;
export const rampY = (z) => Math.min(C.ramp.h, Math.max(0, ((C.ramp.z0 - z) / (C.ramp.z0 - C.ramp.z1)) * C.ramp.h));
export const courseY = (z) => (z < C.ramp.z0 ? rampY(z) : 0); // what bots walk on
// rolling balls on the ramp: slot k of 4 → {x, y, z} or null
export function ballPos(k, t) {
  const n = Math.floor(t / C.ball.every) - k;
  if (n < 0) return null;
  const age = t - n * C.ball.every;
  const z = C.ramp.z1 - 4 + age * C.ball.speed;
  if (z > C.ramp.z0 + 3) return null;
  const lane = ((n * 7 + (n >> 1) * 3) % 3) - 1;
  return { x: lane * 4, y: rampY(z) + C.ball.r, z };
}

// highest surface the feet (at height fy) can stand on; null = thin air
export function courseGround(x, z, t, fy) {
  let best = null;
  const M = 0.3;
  const test = (y, vx = 0) => { if (y <= fy + 0.6 && (!best || y > best.y)) best = { y, vx }; };
  for (const p of C.pads) if (Math.abs(x - p.x) <= p.w / 2 + M && Math.abs(z - p.z) <= p.d / 2 + M) test(p.y);
  if (Math.hypot(x - C.disc.x, z - C.disc.z) <= C.disc.r + M) test(0);
  for (let i = 0; i < C.movers.length; i++) {
    if (Math.abs(z - C.movers[i].z) <= C.moverD / 2 + M && Math.abs(x - moverX(i, t)) <= C.moverW / 2 + M) test(0, moverVx(i, t));
  }
  const T = C.tiles;
  if (z <= T.z0 + M && z >= T.z0 - T.rows * T.size - M) {
    const c = Math.floor(x / T.size + T.cols / 2), r = Math.floor((T.z0 - z) / T.size);
    if (c >= 0 && c < T.cols && r >= 0 && r < T.rows && tilePhase(c, r, t) < T.on) test(0);
  }
  if (Math.abs(x) <= C.ramp.w / 2 + M && z <= C.ramp.z0 && z >= C.ramp.z1) test(rampY(z));
  return best;
}
