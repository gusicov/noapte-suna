// Noapte Sună – room server (HTTP static + WebSocket). Runs on any free Node host.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { HX, HZ, SPEED, BAMBA, CHARS, SPAWNS, collide } from './docs/js/shared.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs');
const PORT = process.env.PORT || 3000;
const TICK = 1 / 20;
const MAX_PLAYERS = 4;
const PASS_DIST = 1.7, HOLD_MIN = 0.2, NO_RETURN = 0.8;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });
const rooms = new Map();
let nextId = 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const BOT_NAMES = ['Robo-Costel', 'Bot Dorel', 'Tanti AI', 'Nea Cip'];

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}

function cleanName(s) {
  return String(s || '').replace(/[<>&"']/g, '').trim().slice(0, 14) || 'Anonim';
}
const validChar = (c) => (CHARS.some((x) => x.id === c) ? c : CHARS[0].id);

class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.phase = 'lobby'; // lobby | countdown | play | pause | end
    this.timer = 0;
    this.hostId = null;
    this.bomb = { holder: null, left: 0, total: 0, got: 0, from: null };
    this.bamba = { x: BAMBA.home.x, z: BAMBA.home.z, ry: -Math.PI / 2, st: 'lurk', t: 0, target: null };
    this.time = 0;
    this.interval = setInterval(() => this.tick(), TICK * 1000);
  }

  send(p, msg) { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s); }
  humans() { return [...this.players.values()].filter((p) => !p.bot); }
  alive() { return [...this.players.values()].filter((p) => p.alive); }

  lobbyMsg() {
    return { t: 'lobby', code: this.code, phase: this.phase, hostId: this.hostId,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, char: p.char, bot: p.bot, score: p.score })) };
  }
  sendLobby() { this.broadcast(this.lobbyMsg()); }

  addPlayer(ws, name, char, bot = false) {
    const p = { id: nextId++, ws, name, char, bot, score: 0, alive: false, x: 0, z: 0, ry: 0, m: 0, ai: { tx: 0, tz: 0, t: 0 } };
    this.players.set(p.id, p);
    if (!bot && this.hostId == null) this.hostId = p.id;
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.humans()[0]?.id ?? null;
    if (!this.humans().length) return this.destroy();
    this.broadcast({ t: 'ev', e: 'left', name: p.name });
    if (p.alive && (this.phase === 'play' || this.phase === 'countdown')) {
      p.alive = false;
      this.afterDeath(p);
    }
    this.sendLobby();
  }

  destroy() { clearInterval(this.interval); rooms.delete(this.code); }

  startMatch() {
    if (this.phase !== 'lobby' || this.players.size < 2) return;
    for (const p of this.players.values()) p.alive = true;
    this.startRound();
  }

  startRound() {
    const alive = this.alive();
    const spots = [...SPAWNS].sort(() => Math.random() - 0.5);
    alive.forEach((p, i) => { p.x = spots[i % 4].x; p.z = spots[i % 4].z; p.ry = Math.PI / 2; p.m = 0; });
    const holder = alive[Math.floor(Math.random() * alive.length)];
    const total = rnd(14, 24);
    this.bomb = { holder: holder.id, left: total, total, got: -9, from: null };
    this.bamba = { x: BAMBA.home.x, z: BAMBA.home.z, ry: -Math.PI / 2, st: 'lurk', t: 0, target: null };
    this.phase = 'countdown';
    this.timer = 3;
    this.broadcast({ t: 'round', holder: holder.id, spawns: alive.map((p) => [p.id, p.x, p.z]) });
    this.sendLobby();
  }

  giveBomb(to, from) {
    this.bomb.holder = to.id;
    this.bomb.from = from ? from.id : null;
    this.bomb.got = this.time;
    this.broadcast({ t: 'ev', e: 'pass', to: to.id, from: from ? from.id : null });
  }

  afterDeath(dead) {
    const alive = this.alive();
    if (alive.length <= 1) {
      const w = alive[0];
      if (w) w.score++;
      this.bomb.holder = null;
      this.phase = 'end';
      this.timer = 6;
      this.broadcast({ t: 'ev', e: 'win', id: w ? w.id : null });
      this.sendLobby();
      return true;
    }
    if (this.bomb.holder === dead.id) {
      const next = alive[Math.floor(Math.random() * alive.length)];
      this.giveBomb(next, null);
    }
    return false;
  }

  tick() {
    this.time += TICK;
    if (this.phase === 'lobby') return;
    if (this.phase === 'countdown') {
      this.timer -= TICK;
      if (this.timer <= 0) { this.phase = 'play'; this.bomb.got = this.time; this.broadcast({ t: 'ev', e: 'go' }); }
    } else if (this.phase === 'pause') {
      this.timer -= TICK;
      if (this.timer <= 0) this.startRound();
    } else if (this.phase === 'end') {
      this.timer -= TICK;
      if (this.timer <= 0) { this.phase = 'lobby'; for (const p of this.players.values()) p.alive = false; this.sendLobby(); }
    } else if (this.phase === 'play') {
      this.updateBots();
      this.updateBomb();
      if (this.phase === 'play') this.updateBamba();
    }
    const b = this.bamba;
    this.broadcast({ t: 's', ph: this.phase,
      ps: [...this.players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.m, p.alive ? 1 : 0]),
      bomb: [this.bomb.holder, +this.bomb.left.toFixed(2), +this.bomb.total.toFixed(2)],
      b: [+b.x.toFixed(2), +b.z.toFixed(2), +b.ry.toFixed(2), b.st, b.target, +b.t.toFixed(2)] });
  }

  updateBomb() {
    const bm = this.bomb;
    const holder = this.players.get(bm.holder);
    if (!holder) return;
    const held = this.time - bm.got;
    if (held >= HOLD_MIN) {
      let best = null, bd = PASS_DIST;
      for (const p of this.alive()) {
        if (p === holder) continue;
        if (p.id === bm.from && held < NO_RETURN) continue; // no instant ping-pong
        const d = dist(p, holder);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) this.giveBomb(best, holder);
    }
    bm.left -= TICK;
    if (bm.left <= 0) {
      const victim = this.players.get(bm.holder);
      victim.alive = false;
      this.broadcast({ t: 'ev', e: 'boom', id: victim.id, by: bm.from, x: victim.x, z: victim.z });
      bm.holder = null;
      if (!this.afterDeath(victim)) { this.phase = 'pause'; this.timer = 3; }
    }
  }

  updateBamba() {
    const b = this.bamba;
    b.t += TICK;
    const alive = this.alive();
    const nearest = (range) => {
      let best = null, bd = range;
      for (const p of alive) { const d = dist(p, b); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    const sit = (why) => { b.st = 'sit'; b.t = 0; b.target = null; if (why) this.broadcast({ t: 'ev', e: why }); };

    if (b.st === 'lurk' || (b.st === 'sit' && b.t >= BAMBA.sitT)) {
      const p = nearest(b.st === 'lurk' ? BAMBA.aggro : BAMBA.retarget);
      if (p) { b.st = 'chase'; b.t = 0; b.target = p.id; this.broadcast({ t: 'ev', e: 'hunt', id: p.id }); }
    }
    if (b.st !== 'chase') return;
    const tg = this.players.get(b.target);
    if (!tg || !tg.alive) return sit();
    const d = dist(tg, b);
    if (d > BAMBA.escape) return sit('escaped');
    if (b.t >= BAMBA.maxT) return sit('tired');
    const sp = (b.t < BAMBA.fastT ? SPEED : SPEED * 0.5) * TICK;
    if (d > 0.01) {
      b.x += ((tg.x - b.x) / d) * Math.min(sp, d);
      b.z += ((tg.z - b.z) / d) * Math.min(sp, d);
      b.ry = Math.atan2(tg.x - b.x, tg.z - b.z);
    }
    b.x = Math.max(-HX, Math.min(HX, b.x)); b.z = Math.max(-HZ, Math.min(HZ, b.z));
    for (const p of alive) {
      if (dist(p, b) < BAMBA.eat) {
        p.alive = false;
        const wasTarget = p.id === b.target;
        this.broadcast({ t: 'ev', e: 'eat', id: p.id });
        if (this.afterDeath(p)) return;
        if (wasTarget) return sit();
      }
    }
  }

  updateBots() {
    const holder = this.players.get(this.bomb.holder);
    const b = this.bamba;
    for (const p of this.players.values()) {
      if (!p.bot || !p.alive) continue;
      let vx = 0, vz = 0, sp = SPEED * 0.93;
      const ai = p.ai;
      if (holder === p) {
        let best = null, bd = 1e9;
        for (const o of this.alive()) { if (o === p) continue; const d = dist(o, p); if (d < bd) { bd = d; best = o; } }
        if (best) { vx = best.x - p.x; vz = best.z - p.z; }
        sp = SPEED;
      } else {
        ai.t -= TICK;
        if (ai.t <= 0) { ai.t = rnd(1, 3); ai.tx = rnd(-HX + 3, HX - 8); ai.tz = rnd(-HZ + 3, HZ - 3); }
        vx = (ai.tx - p.x) * 0.05; vz = (ai.tz - p.z) * 0.05;
        if (holder) { const d = dist(holder, p); if (d < 13) { vx += ((p.x - holder.x) / d) * (13 - d); vz += ((p.z - holder.z) / d) * (13 - d); } }
        const db = dist(b, p);
        if (db < 14 && b.st !== 'sit') { vx += ((p.x - b.x) / db) * (14 - db) * 1.5; vz += ((p.z - b.z) / db) * (14 - db) * 1.5; }
        // stay away from the edges
        vx -= Math.pow(p.x / HX, 5) * 12; vz -= Math.pow(p.z / HZ, 5) * 12;
      }
      const l = Math.hypot(vx, vz);
      if (l > 0.3) {
        const ox = p.x, oz = p.z;
        p.x += (vx / l) * sp * TICK; p.z += (vz / l) * sp * TICK;
        collide(p);
        // slide around the hose when stuck on it
        if (Math.hypot(p.x - ox, p.z - oz) < sp * TICK * 0.4) { p.x += (-vz / l) * sp * TICK; p.z += (vx / l) * sp * TICK; collide(p); }
        p.ry = Math.atan2(vx, vz); p.m = 1;
      } else p.m = 0;
    }
  }
}

wss.on('connection', (ws) => {
  let room = null, me = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'create' || m.t === 'join') {
      if (room) return;
      if (m.t === 'create') {
        if (rooms.size > 200) return ws.send(JSON.stringify({ t: 'err', msg: 'Serverul e plin. Încearcă mai târziu.' }));
        room = new Room(makeCode());
        rooms.set(room.code, room);
      } else {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return ws.send(JSON.stringify({ t: 'err', msg: 'Nu există camera asta. Verifică codul.' }));
        if (r.players.size >= MAX_PLAYERS) {
          const bot = [...r.players.values()].find((p) => p.bot && !p.alive);
          if (!bot) return ws.send(JSON.stringify({ t: 'err', msg: 'Camera e plină (maxim 4).' }));
          r.players.delete(bot.id);
        }
        room = r;
      }
      me = room.addPlayer(ws, cleanName(m.name), validChar(m.char));
      ws.send(JSON.stringify({ t: 'joined', id: me.id, code: room.code }));
      room.sendLobby();
      return;
    }
    if (!room || !me) return;

    switch (m.t) {
      case 'p':
        if (me.alive && room.phase === 'play' && Number.isFinite(m.x) && Number.isFinite(m.z)) {
          me.x = Math.max(-HX, Math.min(HX, m.x)); me.z = Math.max(-HZ, Math.min(HZ, m.z));
          me.ry = Number.isFinite(m.ry) ? m.ry : 0; me.m = m.m ? (m.m === 2 ? 2 : 1) : 0;
        }
        break;
      case 'char':
        me.char = validChar(m.char); room.sendLobby(); break;
      case 'start':
        if (me.id === room.hostId) room.startMatch(); break;
      case 'addbot':
        if (me.id === room.hostId && room.phase === 'lobby' && room.players.size < MAX_PLAYERS) {
          const used = new Set([...room.players.values()].map((p) => p.name));
          const usedC = new Set([...room.players.values()].map((p) => p.char));
          const c = CHARS.find((x) => !usedC.has(x.id)) || CHARS[Math.floor(Math.random() * CHARS.length)];
          room.addPlayer(null, BOT_NAMES.find((n) => !used.has(n)) || 'Bot', c.id, true);
          room.sendLobby();
        }
        break;
      case 'rmbot':
        if (me.id === room.hostId && room.phase === 'lobby') {
          const bot = [...room.players.values()].reverse().find((p) => p.bot);
          if (bot) { room.players.delete(bot.id); room.sendLobby(); }
        }
        break;
    }
  });
  ws.on('close', () => { if (room && me) room.removePlayer(me.id); });
  ws.on('error', () => {});
});

server.listen(PORT, () => console.log(`Noapte Sună: http://localhost:${PORT}`));
