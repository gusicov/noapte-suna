import * as THREE from 'three';
import { HX, HZ, HOSE_R, hosePoint } from './shared.js';

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const rows = 8, h = 1024 / rows;
  const tones = ['#8d877b', '#7d776c', '#969084', '#6f6a60', '#857f73', '#9a9488'];
  for (let r = 0; r < rows; r++) {
    let x = -Math.random() * 400;
    while (x < 1024) {
      const w = 380 + Math.random() * 300;
      g.fillStyle = tones[Math.floor(Math.random() * tones.length)];
      g.fillRect(x, r * h, w, h);
      // grain
      for (let i = 0; i < 46; i++) {
        const y = r * h + Math.random() * h;
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(40,34,26,.13)' : 'rgba(235,228,214,.10)';
        g.lineWidth = 0.6 + Math.random() * 1.6;
        g.beginPath();
        g.moveTo(x, y);
        const amp = Math.random() * 7, f = 0.004 + Math.random() * 0.012, ph = Math.random() * 6;
        for (let px = 0; px <= w; px += 16) g.lineTo(x + px, y + Math.sin(px * f + ph) * amp);
        g.stroke();
      }
      if (Math.random() < 0.55) { // knot
        const kx = x + 40 + Math.random() * (w - 80), ky = r * h + 24 + Math.random() * (h - 48);
        for (let k = 5; k > 0; k--) {
          g.strokeStyle = `rgba(45,36,26,${0.07 + (5 - k) * 0.04})`;
          g.lineWidth = 2;
          g.beginPath(); g.ellipse(kx, ky, k * 9, k * 4, 0, 0, Math.PI * 2); g.stroke();
        }
      }
      g.fillStyle = 'rgba(20,16,12,.55)';
      g.fillRect(x + w - 2, r * h, 3, h);
      x += w;
    }
    g.fillStyle = 'rgba(20,16,12,.6)';
    g.fillRect(0, r * h, 1024, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function ribTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(205,228,245,.20)';
  g.fillRect(0, 0, 64, 4);
  const gr = g.createLinearGradient(20, 0, 44, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.5, 'rgba(255,255,255,.85)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(20, 0, 24, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(190, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tapeTexture(rep) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#ffc93c'; g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#15161f';
  for (let i = -1; i < 3; i++) { g.beginPath(); g.moveTo(i * 32, 16); g.lineTo(i * 32 + 16, 16); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep, 1); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class HoseCurve extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) { const p = hosePoint(t); return target.set(p.x, p.y, p.z); }
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x0b0d1a);
  scene.fog = new THREE.Fog(0x0b0d1a, 70, 170);

  scene.add(new THREE.HemisphereLight(0xa9b8ff, 0x3a2c22, 1.0));
  const sun = new THREE.DirectionalLight(0xffdfb0, 2.3);
  sun.position.set(-26, 46, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 36, bottom: -36, near: 5, far: 120 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x5f7bff, 0.7);
  moon.position.set(30, 20, -30);
  scene.add(moon);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.62, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // hazard tape around the arena
  const tapeMat = (len) => new THREE.MeshBasicMaterial({ map: tapeTexture(len / 2.2) });
  for (const [x, z, w, d] of [[0, -HZ - 0.4, HX * 2 + 1.6, 0.8], [0, HZ + 0.4, HX * 2 + 1.6, 0.8], [-HX - 0.4, 0, HZ * 2, 0.8], [HX + 0.4, 0, HZ * 2, 0.8]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tapeMat(w));
    m.rotation.x = -Math.PI / 2;
    if (x !== 0) m.rotation.z = Math.PI / 2;
    m.position.set(x, 0.03, z);
    scene.add(m);
  }

  // the giant knotted hose
  const geo = new THREE.TubeGeometry(new HoseCurve(), 420, HOSE_R, 22, false);
  const map = ribTexture();
  const mk = (side, order) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, transparent: true, side, depthWrite: false, roughness: 0.25, metalness: 0.1,
      emissive: 0x8fb5d6, emissiveIntensity: 0.16 }));
    m.renderOrder = order;
    return m;
  };
  scene.add(mk(THREE.BackSide, 5), mk(THREE.FrontSide, 6));
  // soft fake shadow under the hose
  const blob = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
  const bg = new THREE.CircleGeometry(HOSE_R * 1.05, 14);
  for (let i = 0; i <= 90; i++) {
    const p = hosePoint(i / 90);
    const s = new THREE.Mesh(bg, blob);
    s.rotation.x = -Math.PI / 2;
    s.position.set(p.x + (p.y - HOSE_R) * 0.5, 0.02, p.z - (p.y - HOSE_R) * 0.4);
    scene.add(s);
  }

  // out-of-arena props, for scale: a mic-stand tripod and Bamba's blanket
  const black = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.4, metalness: 0.6 });
  const hub = new THREE.Group();
  hub.position.set(-10, 0, -54);
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 10), black);
    leg.rotation.z = Math.PI / 2 - 0.22;
    leg.position.set(14, 3.6, 0);
    const piv = new THREE.Group();
    piv.rotation.y = (i / 3) * Math.PI * 2 + 0.5;
    piv.add(leg);
    leg.castShadow = true;
    hub.add(piv);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 90, 12), black);
  pole.position.y = 50;
  hub.add(pole);
  scene.add(hub);

  const blanket = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a3f6b, roughness: 1 }));
  blanket.scale.set(1, 0.05, 1.15);
  blanket.position.set(HX + 9, 0, 0);
  blanket.receiveShadow = true;
  scene.add(blanket);

  return { sun };
}
