import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARS, PLAYER_H } from './shared.js';

export const COLORS = ['#ff5a36', '#5ee6b0', '#ffc93c', '#6fb1ff'];
export const models = {};

// how each character handles (same top speed for everyone, different feel)
export const HANDLING = {
  gusi:   { grip: 4.2, slide: 2.2 },   // drifts like he owns the floor
  aourel: { grip: 6.5, slide: 5.5 },   // top-heavy
  sunyk:  { grip: 11, slide: 10, hop: true }, // moves in hops
  gluga:  { grip: 15, slide: 13 },     // twitchy
};

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const ids = [...CHARS.map((c) => c.id), 'bamba'];
  let done = 0;
  await Promise.all(ids.map(async (id) => {
    const g = await loader.loadAsync(`assets/${id}.glb`);
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.material.roughness = 0.8; o.material.metalness = 0;
        if (o.material.map) o.material.map.anisotropy = 4;
      }
    });
    models[id] = g.scene;
    onProgress?.(++done / ids.length);
  }));
}

function label(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '800 34px Nunito, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(8,10,22,.9)'; g.lineJoin = 'round';
  g.strokeText(text, 128, 32);
  g.fillStyle = color; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(4.4, 1.1, 1);
  s.renderOrder = 20;
  return s;
}

export class Actor {
  constructor(scene, char, name, color) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.group.add(this.ring);
    this.color = new THREE.Color(color);
    this.label = label(name, color);
    this.label.position.y = PLAYER_H + 1.0;
    this.group.add(this.label);
    this.setChar(char);
    scene.add(this.group);
    this.ph = Math.random() * 6; this.s = 0; this.wob = 0; this.yaw = 0; this.seed = Math.random() * 100;
    this.alive = true; this.dying = null; this.hop = 0;
    this.tx = 0; this.tz = 0; this.tyaw = 0; this.moving = 0;
  }

  setChar(char) {
    if (this.char === char) return;
    this.char = char;
    if (this.model) this.tilt.remove(this.model);
    this.model = models[char].clone();
    this.model.scale.setScalar(PLAYER_H);
    this.tilt.add(this.model);
  }

  place(x, z, yaw = 0) { this.group.position.set(x, 0, z); this.tx = x; this.tz = z; this.yaw = this.tyaw = yaw; }

  revive() { this.alive = true; this.dying = null; this.group.visible = true; this.group.scale.setScalar(1); this.group.position.y = 0; this.tilt.rotation.set(0, 0, 0); }

  kill(kind, toward) {
    if (!this.alive) return;
    this.alive = false;
    this.dying = { kind, t: 0, toward, from: this.group.position.clone() };
  }

  update(dt, time, hasBomb) {
    const g = this.group, tl = this.tilt;
    if (this.dying) {
      const d = this.dying; d.t += dt;
      const k = Math.min(1, d.t / 0.7);
      if (d.kind === 'boom') {
        g.position.y = k * 16; tl.rotation.x += dt * 18; tl.rotation.z += dt * 11; g.scale.setScalar(1 + k * 0.6);
      } else {
        g.position.lerpVectors(d.from, d.toward, k); g.position.y = Math.sin(k * Math.PI) * 2.5 + k * 2;
        g.scale.setScalar(1 - k * 0.9); tl.rotation.z += dt * 14;
      }
      if (k >= 1) { this.dying = null; g.visible = false; }
      return;
    }
    if (!this.alive) return;

    // shortest-arc yaw smoothing
    let dy = this.tyaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-14 * dt));

    const mv = this.moving ? 1 : 0;
    if (this.s > 0.5 && !mv) this.wob = 1;
    this.s += (mv - this.s) * (1 - Math.exp(-10 * dt));
    this.wob *= Math.exp(-2.2 * dt);
    const s = this.s, t = time + this.seed;
    let rx = 0, rz = 0, y = 0, yaw = 0, sy = 1;

    switch (this.char) {
      case 'gusi': { // cool glide, leaning back, shoulders swinging
        this.ph += dt * 7 * (0.25 + s);
        rx = -0.16 * s; rz = Math.sin(this.ph) * 0.07 * s + Math.sin(t * 1.2) * 0.03;
        y = Math.abs(Math.sin(this.ph)) * 0.05 * s; yaw = Math.sin(this.ph) * 0.16 * s;
        const flick = (t % 4.5) / 0.5; // a cool head-flick every few seconds
        if (flick < 1 && s < 0.3) rz += Math.sin(flick * Math.PI) * 0.16;
        break;
      }
      case 'aourel': { // big head: waddles, tips forward, bobbles when he stops
        this.ph += dt * 9.5 * (0.2 + s);
        rz = Math.sin(this.ph) * 0.24 * s + Math.sin(t * 1.7) * 0.035;
        rx = 0.17 * s + Math.sin(this.ph * 2) * 0.06 * s + Math.sin(t * 2.2) * 0.04 + Math.sin(t * 10) * 0.2 * this.wob;
        y = Math.abs(Math.sin(this.ph)) * 0.13 * s;
        break;
      }
      case 'sunyk': { // a leg. it hops.
        this.ph += dt * 9 * (0.0 + s);
        const idleHop = Math.max(0, Math.sin(t * 2.1) - 0.8) * 5; // occasional bored hop
        const h = Math.abs(Math.sin(this.ph)) * s + idleHop * (1 - s) * 0.5;
        y = h * 1.0; sy = 1 + (h - 0.3 * s) * 0.3;
        rx = Math.cos(this.ph) * 0.3 * s + Math.max(0, Math.sin(t * 6)) * 0.07 * (1 - s);
        this.hop = Math.abs(Math.sin(this.ph));
        break;
      }
      default: { // gluga: hunched, quick shuffle, keeps checking over his shoulder
        this.ph += dt * 17 * (0.1 + s);
        rx = 0.24 * s; sy = 1 - 0.08 * s;
        y = Math.abs(Math.sin(this.ph)) * 0.07 * s;
        rz = Math.sin(this.ph) * 0.05 * s + Math.sin(t * 23) * 0.008;
        const look = Math.sin(t * 0.9);
        yaw = (1 - s) * (look > 0.55 ? 0.7 : look < -0.55 ? -0.7 : 0) + s * Math.sin(t * 3) * 0.25;
      }
    }
    if (hasBomb) { rz += Math.sin(time * 34) * 0.06; y += Math.abs(Math.sin(time * 17)) * 0.12; }

    this.lookYaw = (this.lookYaw || 0) + (yaw - (this.lookYaw || 0)) * (1 - Math.exp(-8 * dt));
    g.rotation.y = this.yaw + this.lookYaw;
    tl.rotation.x = rx; tl.rotation.z = rz; tl.position.y = y;
    tl.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.ring.material.color.set(hasBomb ? 0xff2a12 : this.color);
    this.ring.scale.setScalar(hasBomb ? 1.35 + Math.sin(time * 14) * 0.25 : 1);
  }

  dispose() { this.scene.remove(this.group); }
}

// ---------------------------------------------------------------------------
const B_SCALE = 7, B_LEN = 1.98 * B_SCALE;

export class Bamba {
  constructor(scene) {
    this.group = new THREE.Group();      // origin = his snout, on the floor
    this.pivot = new THREE.Group();      // rotates around his butt
    this.pivot.position.z = -B_LEN * 0.82;
    this.model = models.bamba.clone();
    this.model.scale.setScalar(B_SCALE);
    this.model.position.z = B_LEN * 0.82 - B_LEN * 0.5;
    this.pivot.add(this.model);
    this.group.add(this.pivot);
    this.name = label('BAMBA', '#c9a2ff');
    this.name.scale.set(11, 2.75, 1);
    this.name.position.set(0, B_SCALE + 3, -B_LEN * 0.4);
    this.group.add(this.name);
    scene.add(this.group);
    this.x = 25; this.z = 0; this.yaw = -Math.PI / 2; this.tx = 25; this.tz = 0; this.tyaw = this.yaw;
    this.st = 'lurk'; this.t = 0; this.ph = 0; this.sit = 0; this.chomp = 0; this.spd = 0;
  }

  update(dt, time) {
    const k = 1 - Math.exp(-12 * dt);
    const px = this.x, pz = this.z;
    this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
    let dy = this.tyaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-7 * dt));
    const v = Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 0.001);
    this.spd += (Math.min(v / 9, 1.2) - this.spd) * (1 - Math.exp(-8 * dt));
    this.sit += ((this.st === 'sit' ? 1 : 0) - this.sit) * (1 - Math.exp(-4 * dt));
    this.chomp = Math.max(0, this.chomp - dt * 2.5);
    this.ph += dt * (4 + this.spd * 9);

    const run = this.spd, bound = Math.sin(this.ph);
    this.group.position.set(this.x, Math.abs(bound) * 1.3 * run, this.z);
    this.group.rotation.y = this.yaw;
    // ferret bounding: body rocks, stretches; sitting: rears up on his butt and looks around
    this.pivot.rotation.x = bound * 0.13 * run - this.sit * 0.72 + Math.sin(this.chomp * Math.PI) * 0.45;
    this.pivot.rotation.y = Math.sin(time * (this.st === 'sit' ? 1.6 : 0.8)) * (0.05 + this.sit * 0.22) + Math.sin(this.ph * 0.5) * 0.06 * run;
    this.pivot.rotation.z = Math.sin(this.ph * 0.5) * 0.05 * run;
    const br = 1 + Math.sin(time * 2.4) * 0.015 * (1 - run);
    this.pivot.scale.set(br, br * (1 - Math.cos(this.ph * 2) * 0.05 * run), 1 + Math.cos(this.ph * 2) * 0.06 * run);
  }

  mouth(out = new THREE.Vector3()) { return out.set(this.x, 2, this.z); }
}

// tiny portrait renders for the character cards
export function portraits() {
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(256, 256);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const out = {};
  for (const c of CHARS) {
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x666688, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, 3, 4); sc.add(d);
    const m = models[c.id].clone();
    m.rotation.y = 0.45;
    sc.add(m);
    cam.position.set(0, 0.62, 2.35); cam.lookAt(0, 0.5, 0);
    r.render(sc, cam);
    out[c.id] = r.domElement.toDataURL('image/png');
  }
  r.dispose();
  return out;
}
