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
  { id: 'gluga',  name: 'Glugă',  tag: 'Dubios din fire. Se furișează repede și se uită peste umăr.' },
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
