// Level 2 visuals: a candy-coloured obstacle course floating over pink goo.
import * as THREE from 'three';
import { C, moverX, pistonX, discAngle, tilePhase, tileX, tileZ, ballPos } from './shared.js';

function stripes(a, b, rep = 4) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 64, 64);
  g.fillStyle = b; g.fillRect(0, 0, 32, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, 1); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function checker() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

export function buildCourse(scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const add = (m, shadow = true) => { m.receiveShadow = true; m.castShadow = shadow; root.add(m); return m; };
  const TH = 1.6; // platform thickness

  // goo far below
  const goo = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0xff7ac8, roughness: 0.3, emissive: 0xff3fa0, emissiveIntensity: 0.25 }));
  goo.rotation.x = -Math.PI / 2; goo.position.set(0, -22, -85);
  root.add(goo);
  // some fluffy clouds for depth
  const cloudM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25 });
  for (let i = 0; i < 26; i++) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(4 + (i % 5) * 1.4, 10, 8), cloudM);
    const side = i % 2 ? 1 : -1;
    cl.position.set(side * (26 + ((i * 37) % 40)), -8 + ((i * 13) % 22), 10 - i * 8);
    cl.scale.set(1.8, 0.7, 1.2);
    root.add(cl);
  }

  // static pads
  for (const p of C.pads) {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(p.w, TH, p.d), mat(p.col)));
    m.position.set(p.x, p.y - TH / 2, p.z);
    const trim = add(new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.5, 0.35, p.d + 0.5), mat(0xffffff)), false);
    trim.position.set(p.x, p.y - TH - 0.1, p.z);
    if (p.cp && p.cp < 4) { // checkpoint flags
      for (const sx of [-1, 1]) {
        const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), mat(0xffffff)));
        pole.position.set(sx * (p.w / 2 - 0.6), 2.5, p.z + p.d / 2 - 0.6);
        const flag = add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.08), mat(0xffc93c, { emissive: 0xffc93c, emissiveIntensity: 0.3 })), false);
        flag.position.set(sx * (p.w / 2 - 0.6) - sx * 0.95, 4.3, p.z + p.d / 2 - 0.6);
      }
    }
  }

  // 1. the spinning sweeper
  const D = C.disc;
  const disc = add(new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r - 0.6, TH, 40), mat(0x53c7ff)));
  disc.position.set(D.x, -TH / 2, D.z);
  const hub = add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.6, 16), mat(0xffffff)));
  hub.position.set(D.x, 0.8, D.z);
  const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, D.bar * 2, 12), new THREE.MeshStandardMaterial({ map: stripes('#ff3d3d', '#ffffff', 1), roughness: 0.4 })));
  bar.material.map.repeat.set(1, 9); bar.material.map.rotation = Math.PI / 2;
  bar.rotation.z = Math.PI / 2;
  const barPivot = new THREE.Group();
  barPivot.position.set(D.x, 0.75, D.z);
  barPivot.add(bar);
  root.add(barPivot);

  // 2. sliding platforms
  const movers = C.movers.map((mv, i) => {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(C.moverW, TH, C.moverD), mat([0xffa53c, 0xff6fb5, 0xffe14d][i])));
    m.position.set(0, -TH / 2, mv.z);
    return m;
  });

  // 3. punching pistons across the bridge
  const pistons = C.pistons.map((ps) => {
    const g = new THREE.Group();
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(C.pistonW, C.pistonH, C.pistonD), mat(0xff3d3d)));
    head.position.y = C.pistonH / 2 + 0.15;
    const face = new THREE.Mesh(new THREE.BoxGeometry(C.pistonW + 0.2, C.pistonH * 0.5, C.pistonD + 0.2), mat(0xffffff));
    face.position.y = C.pistonH / 2 + 0.15;
    const rail = add(new THREE.Mesh(new THREE.BoxGeometry(C.pistonAmp * 2 + 5, 0.3, 0.6), mat(0x3a3f66)), false);
    rail.position.set(0, -0.2, ps.z);
    g.add(head, face);
    g.position.z = ps.z;
    root.add(g);
    return g;
  });

  // 4. blinking tiles
  const T = C.tiles, tiles = [];
  const tileGeo = new THREE.BoxGeometry(T.size - 0.25, 0.6, T.size - 0.25);
  for (let r = 0; r < T.rows; r++) for (let c = 0; c < T.cols; c++) {
    const m = add(new THREE.Mesh(tileGeo, mat((r + c) % 2 ? 0xb58cff : 0x7de3ff, { transparent: true, emissive: 0xff2222, emissiveIntensity: 0 })), false);
    m.position.set(tileX(c), -0.3, tileZ(r));
    tiles.push({ m, c, r });
  }

  // 5. the ramp + rolling balls
  const R = C.ramp, len = Math.hypot(R.z0 - R.z1, R.h);
  const ramp = add(new THREE.Mesh(new THREE.BoxGeometry(R.w, 0.8, len), new THREE.MeshStandardMaterial({ map: stripes('#ff9f43', '#ffd166', 1), roughness: 0.6 })));
  ramp.material.map.repeat.set(1, 8); ramp.material.map.rotation = Math.PI / 2;
  ramp.position.set(0, R.h / 2 - 0.4, (R.z0 + R.z1) / 2);
  ramp.rotation.x = Math.atan2(R.h, R.z0 - R.z1);
  const ballM = new THREE.MeshStandardMaterial({ map: stripes('#ffffff', '#ff4d6d', 3), roughness: 0.35 });
  const balls = [0, 1, 2, 3].map(() => add(new THREE.Mesh(new THREE.SphereGeometry(C.ball.r, 20, 14), ballM)));

  // finish arch
  const arch = new THREE.Group();
  arch.position.set(0, C.finishY, C.finishZ);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7, 12), mat(0xff3d7f));
    post.position.set(sx * 8, 3.5, 0); post.castShadow = true;
    arch.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(17, 2, 0.4), new THREE.MeshBasicMaterial({ map: checker() }));
  banner.position.y = 7.2;
  arch.add(banner);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.2), new THREE.MeshBasicMaterial({ map: checker() }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.03;
  arch.add(line);
  root.add(arch);

  function update(t) {
    barPivot.rotation.y = -discAngle(t); // matches the hit test in main.js
    movers.forEach((m, i) => (m.position.x = moverX(i, t)));
    pistons.forEach((p, i) => (p.position.x = pistonX(i, t)));
    for (const tl of tiles) {
      const ph = tilePhase(tl.c, tl.r, t), on = ph < T.on;
      const warn = on && ph > T.on - 0.14;
      tl.m.visible = on || ph > 0.97;
      tl.m.material.opacity = on ? 1 : 0.35;
      tl.m.material.emissiveIntensity = warn ? 0.5 + Math.sin(t * 40) * 0.5 : 0;
      tl.m.position.y = warn ? -0.3 + Math.sin(t * 60) * 0.05 : -0.3;
    }
    balls.forEach((b, k) => {
      const p = ballPos(k, t);
      b.visible = !!p;
      if (p) { b.position.set(p.x, p.y, p.z); b.rotation.x = p.z * 0.7; }
    });
  }
  return { root, update };
}
