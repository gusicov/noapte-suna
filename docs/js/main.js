import * as THREE from 'three';
import { HX, HZ, SPEED, PLAYER_H, PR, CHARS, SPAWNS, collide, C, courseGround, pistonX, pistonVx, discAngle, ballPos } from './shared.js';
import { buildCourse } from './course.js';
import { SERVER, ROOM_FROM_URL } from './config.js';
import { buildWorld } from './world.js';
import { Actor, Bamba, COLORS, HANDLING, loadModels, portraits } from './actors.js';
import { initAudio, startMusic, sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const ui = { menu: $('menu'), lobby: $('lobby'), hud: $('hud'), banner: $('banner'), big: $('big'), feed: $('feed'), scores: $('scores'),
  vignette: $('vignette'), flash: $('flash'), dash: $('dash').firstElementChild, stick: $('stick'), loading: $('loading') };

// ---------------------------------------------------------------- renderer --
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.15, 400);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 62 : 46;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
const world = buildWorld(scene);
const course = buildCourse(scene);
let mode = 'banana', raceT = 0, timeLeft = 0;
const SKY = new THREE.Color(0x8fd3ff), NIGHT = new THREE.Color(0x0b0d1a);
function setMode(m) {
  mode = m === 'race' ? 'race' : 'banana';
  const race = mode === 'race';
  world.root.visible = !race; course.root.visible = race;
  scene.background = race ? SKY : NIGHT;
  scene.fog.color.copy(scene.background); scene.fog.near = race ? 110 : 70; scene.fog.far = race ? 380 : 170;
  if (!race) { world.sun.position.set(-26, 46, 22); world.sun.target.position.set(0, 0, 0); }
}

// -------------------------------------------------------------------- state --
let ws = null, myId = null, lobby = null, phase = 'menu';
const actors = new Map();
let demo = [];
let bamba = null;
const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, dashT: 0, dashCd: 0, dx: 0, dz: 1, air: 0, jumpQ: 0, cp: 0, hitCd: 0, fin: 0 };
const bombS = { holder: null, left: 0, total: 1, tickT: 0, punch: 0 };
let countdown = 0, lastCount = 0, bigTimer = 0, shake = 0, sendT = 0, time = 0, camAngle = 0.6;
const menuB = { mode: 'sit', t: 2, gx: 0, gz: 0 };
const keys = new Set();
const stick = { on: false, id: null, ox: 0, oy: 0, x: 0, z: 0 };
const cam = { yaw: -Math.PI / 2, pitch: 0.24, dist: 5.2, lookId: null, lx: 0, ly: 0 };
function look(dx, dy, k = 1) {
  cam.yaw -= dx * 0.0026 * k;
  cam.pitch = Math.min(1.25, Math.max(-0.3, cam.pitch + dy * 0.0022 * k));
}
let myChar = localStorage.getItem('ns_char') || CHARS[Math.floor(Math.random() * CHARS.length)].id;

const nameOf = (id) => lobby?.players.find((p) => p.id === id)?.name ?? '???';
const myActor = () => actors.get(myId);
const iAmAlive = () => !!myActor()?.alive;

// --------------------------------------------------------------------- bomb --
const bomb = new THREE.Group(); // it's a banana. a big, ticking banana.
{
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.75, 0.12), new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 0.75, 0.12));
  const SEG = 28, RAD = 10;
  const geo = new THREE.TubeGeometry(curve, SEG, 0.2, RAD, false);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Vector3(), v = new THREE.Vector3();
  const yellow = new THREE.Color(0xffd92e), tip = new THREE.Color(0x4a3312), green = new THREE.Color(0xb9c93a), cc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const u = Math.floor(i / (RAD + 1)) / SEG;
    curve.getPoint(u, c);
    const taper = u < 0.001 || u > 0.999 ? 0.001 : Math.max(0.2, Math.pow(Math.sin(Math.PI * u), 0.45));
    v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(taper).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
    if (u < 0.05 || u > 0.96) cc.copy(tip); else if (u > 0.86) cc.copy(yellow).lerp(green, (u - 0.86) * 8); else cc.copy(yellow);
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: 0xff7a00, emissiveIntensity: 0.3 }));
  body.castShadow = true;
  body.rotation.x = 0.5;
  const light = new THREE.PointLight(0xffb020, 0, 14, 1.6);
  bomb.add(body, light);
  bomb.userData = { body, light };
  bomb.visible = false;
  scene.add(bomb);
}

const blasts = [];
function explode(x, z) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true }));
  ball.position.set(x, 1.5, z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.08, z);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  scorch.rotation.x = -Math.PI / 2; scorch.position.set(x, 0.035, z);
  scene.add(ball, ring, scorch);
  blasts.push({ ball, ring, scorch, t: 0 });
  shake = 1.6;
  ui.flash.style.transition = 'none'; ui.flash.style.opacity = 0.85;
  requestAnimationFrame(() => { ui.flash.style.transition = 'opacity .5s'; ui.flash.style.opacity = 0; });
  sfx.boom();
  // knockback for me
  if (iAmAlive()) {
    const dx = me.x - x, dz = me.z - z, d = Math.hypot(dx, dz) || 1;
    if (d < 10) { me.vx += (dx / d) * 26 * (1 - d / 10); me.vz += (dz / d) * 26 * (1 - d / 10); }
  }
}
function clearScorch() { for (const b of blasts) scene.remove(b.ball, b.ring, b.scorch); blasts.length = 0; }

// ----------------------------------------------------------------------- UI --
function show(el, on) { el.classList.toggle('hidden', !on); }
function setBanner(text, cls = '') {
  if (ui.banner.textContent !== text) ui.banner.textContent = text;
  if (ui.banner.className !== 'banner ' + cls) ui.banner.className = 'banner ' + cls;
}
function big(html, secs = 0) {
  ui.big.innerHTML = html; bigTimer = secs;
  ui.big.classList.remove('pop'); void ui.big.offsetWidth; ui.big.classList.add('pop');
}
function feed(html, cls = '') {
  const li = document.createElement('li');
  li.className = cls; li.innerHTML = html;
  ui.feed.prepend(li);
  while (ui.feed.children.length > 5) ui.feed.lastChild.remove();
  setTimeout(() => li.classList.add('out'), 9000);
  setTimeout(() => li.remove(), 9700);
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function renderScores() {
  if (!lobby) return;
  ui.scores.innerHTML = `<li class="room">CAMERA ${lobby.code}</li>` + lobby.players.map((p, i) => {
    const dead = phase !== 'lobby' && actors.get(p.id) && !actors.get(p.id).alive;
    return `<li class="${dead ? 'dead' : ''}"><i class="dot" style="background:${COLORS[i % 4]}"></i>${p.name}${p.id === myId ? ' (tu)' : ''}${mode === 'race' && actors.get(p.id)?.fin ? ' 🏁' + actors.get(p.id).fin : ''}<b>${p.score}</b></li>`;
  }).join('');
}

let thumbs = {};
function buildCharCards() {
  $('chars').innerHTML = CHARS.map((c) => `<div class="char" data-id="${c.id}"><img src="${thumbs[c.id]}" alt=""><div>${c.name}</div></div>`).join('');
  for (const el of $('chars').children) {
    el.addEventListener('click', () => {
      myChar = el.dataset.id; localStorage.setItem('ns_char', myChar);
      send({ t: 'char', char: myChar });
    });
  }
}
function renderLobby() {
  const mine = lobby.players.find((p) => p.id === myId);
  const host = lobby.hostId === myId;
  $('lobby-code').textContent = lobby.code;
  $('count').textContent = `(${lobby.players.length}/4)`;
  for (const el of $('chars').children) el.classList.toggle('sel', el.dataset.id === mine?.char);
  $('char-tag').textContent = CHARS.find((c) => c.id === mine?.char)?.tag ?? '';
  $('lobby-players').innerHTML = lobby.players.map((p, i) =>
    `<li><i class="dot" style="background:${COLORS[i % 4]}"></i>${p.name}${p.id === lobby.hostId ? ' 👑' : ''}${p.bot ? ' 🤖' : ''}<small>${CHARS.find((c) => c.id === p.char)?.name} · ${p.score}p</small></li>`).join('');
  show($('host-tools'), host);
  $('btn-start').disabled = !host || lobby.players.length < 2;
  $('btn-start').textContent = host ? 'Start!' : 'Așteaptă gazda…';
  $('lobby-msg').textContent = host && lobby.players.length < 2 ? 'Trimite codul prietenilor sau adaugă un bot ca să poți porni.' : '';
}

// ------------------------------------------------------------------ network --
function send(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); }

let awake = null;
function wake() {
  if (awake) return awake;
  const st = $('server-status');
  awake = (async () => {
    for (let i = 0; i < 45; i++) {
      try {
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), 8000);
        const r = await fetch(SERVER + '/health', { cache: 'no-store', signal: ac.signal });
        clearTimeout(to);
        if (r.ok) { st.textContent = 'Server pregătit ✓'; st.classList.add('ok'); return true; }
      } catch { /* still asleep */ }
      st.textContent = i < 2 ? 'Se verifică serverul…' : `Serverul se trezește… poate dura până la un minut (${i * 3}s)`;
      await new Promise((r) => setTimeout(r, 3000));
    }
    st.textContent = 'Serverul nu răspunde. Reîncarcă pagina peste puțin timp.';
    awake = null;
    return false;
  })();
  return awake;
}

async function connect(first) {
  startMusic();
  const name = $('name').value.trim() || 'Anonim';
  localStorage.setItem('ns_name', name);
  $('menu-msg').textContent = 'Se conectează…';
  $('btn-create').disabled = $('btn-join').disabled = true;
  const ok = await wake();
  if (!ok) { $('menu-msg').textContent = 'Nu pot ajunge la server.'; $('btn-create').disabled = $('btn-join').disabled = false; return; }
  ws = new WebSocket(SERVER.replace(/^http/, 'ws'));
  const sock = ws;
  const giveUp = setTimeout(() => { if (sock.readyState !== 1) sock.close(); }, 15000);
  ws.onopen = () => { clearTimeout(giveUp); send({ ...first, name, char: myChar }); };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    const was = myId != null;
    ws = null; myId = null; lobby = null; phase = 'menu';
    for (const a of actors.values()) a.dispose();
    actors.clear(); clearScorch(); bomb.visible = false;
    show(ui.lobby, false); show(ui.hud, false); show(ui.menu, true);
    ui.vignette.style.opacity = 0; ui.big.innerHTML = '';
    $('btn-create').disabled = $('btn-join').disabled = false;
    setMode('banana');
    if (was) $('menu-msg').textContent = 'S-a pierdut conexiunea cu serverul. Intră din nou cu același cod.';
    else if (pendingErr) { $('menu-msg').textContent = pendingErr; pendingErr = ''; }
    else if ($('menu-msg').textContent === 'Se conectează…') $('menu-msg').textContent = 'Nu m-am putut conecta. Mai apasă o dată; dacă tot nu merge, oprește VPN/adblock sau încearcă alt browser.';
    for (const a of demo) a.dispose();
    makeDemo();
  };
}

setInterval(() => { if (!document.hidden) fetch(SERVER + '/health', { cache: 'no-store' }).catch(() => {}); }, 240000); // keeps the free server awake while someone has the page open

function syncActors() {
  const ids = new Set(lobby.players.map((p) => p.id));
  for (const [id, a] of actors) if (!ids.has(id)) { a.dispose(); actors.delete(id); }
  lobby.players.forEach((p, i) => {
    let a = actors.get(p.id);
    if (!a) {
      a = new Actor(scene, p.char, p.name, COLORS[i % 4]);
      a.alive = false; a.group.visible = false;
      actors.set(p.id, a);
    }
    a.setChar(p.char);
    if (lobby.phase === 'lobby') { a.revive(); a.moving = 0; a.place(SPAWNS[i % 4].x + 8, SPAWNS[i % 4].z * 0.6, Math.PI / 2); }
  });
}

let justJoined = false, pendingErr = '';
function onMessage(m) {
  switch (m.t) {
    case 'err':
      pendingErr = m.msg; ws?.close();
      if (m.gone) { history.replaceState(null, '', location.pathname); $('code').value = ''; inviteMode(false); }
      break;
    case 'joined':
      myId = m.id;
      for (const a of demo) a.dispose();
      demo = [];
      history.replaceState(null, '', `${location.pathname}?room=${m.code}${location.search.includes('server=') ? '&server=' + encodeURIComponent(SERVER) : ''}`);
      show(ui.menu, false); $('menu-msg').textContent = '';
      justJoined = true;
      break;
    case 'lobby': {
      const wasLobby = phase === 'lobby';
      lobby = m;
      syncActors();
      if (m.phase === 'lobby') {
        phase = 'lobby'; bomb.visible = false; bombS.holder = null; setMode('banana');
        if (!wasLobby) { clearScorch(); ui.big.innerHTML = ''; setBanner(''); ui.vignette.style.opacity = 0; }
        show(ui.lobby, true); show(ui.hud, false);
        renderLobby();
      } else {
        if (phase === 'lobby' || phase === 'menu') phase = m.phase;
        show(ui.lobby, false); show(ui.hud, true);
        if (justJoined) feed('👀 Meciul e deja pornit. Te uiți acum și joci de la următorul.', 'info');
      }
      justJoined = false;
      renderScores();
      break;
    }
    case 'round': {
      phase = 'countdown'; countdown = 3; lastCount = 4;
      setMode(m.mode); raceT = 0; clearScorch();
      const race = mode === 'race';
      for (const a of actors.values()) { a.alive = false; a.dying = null; a.group.visible = false; a.fin = 0; a.ty = 0; }
      for (const [id, x, z] of m.spawns) {
        const a = actors.get(id);
        if (!a) continue;
        a.revive(); a.place(x, z, race ? Math.PI : Math.PI / 2);
        if (id === myId) {
          Object.assign(me, { x, z, y: 0, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, dashCd: 0, cp: 0, fin: 0, air: 0 });
          cam.yaw = race ? 0 : -Math.PI / 2; cam.pitch = 0.24;
        }
      }
      bombS.holder = m.holder; bombS.tickT = 0;
      show(ui.lobby, false); show(ui.hud, true);
      renderScores();
      break;
    }
    case 's': {
      if (phase !== 'lobby' && phase !== 'menu') phase = m.ph;
      if (m.md !== mode && phase !== 'lobby' && phase !== 'menu') setMode(m.md);
      timeLeft = m.tl;
      if (Math.abs(m.rt - raceT) > 0.5) raceT = m.rt; else raceT += (m.rt - raceT) * 0.1;
      for (const [id, x, z, ry, mv, alive, y, fin] of m.ps) {
        const a = actors.get(id);
        if (!a) continue;
        if (a.alive && !alive) { a.kill('eat', bamba.mouth()); renderScores(); }
        if (fin && a.fin !== fin) { a.fin = fin; renderScores(); }
        if (id === myId && a.alive && phase === 'play') continue; // I own my position
        a.tx = x; a.tz = z; a.ty = y || 0; a.tyaw = ry; a.moving = mv;
      }
      [bombS.holder, bombS.left, bombS.total] = m.bomb;
      [bamba.tx, bamba.tz, bamba.tyaw, bamba.st, bamba.target, bamba.t] = m.b;
      break;
    }
    case 'ev': onEvent(m); break;
  }
}

function onEvent(m) {
  switch (m.e) {
    case 'go': big('GO!', 0.7); sfx.go(); break;
    case 'pass':
      sfx.pass(); bombS.punch = 1;
      if (m.to === myId) { shake = Math.max(shake, 0.5); navigator.vibrate?.(80); }
      break;
    case 'boom': {
      const a = actors.get(m.id);
      explode(m.x, m.z);
      a?.kill('boom');
      const v = `<b>${nameOf(m.id)}</b>`, k = m.by != null ? `<b>${nameOf(m.by)}</b>` : null;
      feed(k ? pick([`💥 ${k} l-a aruncat în aer pe ${v} (i-a pasat banana)`, `💥 ${v} a făcut BUM cu banana primită de la ${k}`, `💥 ${k} → 🍌 → ${v}. Odihnească-se în bucăți.`])
        : pick([`💥 ${v} a rămas cu banana în mână și a explodat singur`, `💥 ${v} n-a apucat să paseze banana. BUM.`]));
      big(`💥 BUM!<small>${nameOf(m.id)} a sărit în aer</small>`, 2.2);
      renderScores();
      break;
    }
    case 'eat': {
      const a = actors.get(m.id);
      a?.kill('eat', bamba.mouth());
      bamba.chomp = 1; sfx.chomp(); shake = Math.max(shake, 0.7);
      const v = `<b>${nameOf(m.id)}</b>`;
      feed(pick([`🦦 Bamba l-a mâncat pe ${v} dintr-o înghițitură`, `🦦 ${v} a fost halit de Bamba`, `🦦 Bamba l-a prins pe ${v}. Nici n-a mestecat.`, `🦦 ${v} s-a dus prea aproape de Bamba. Gustos.`]), 'eat');
      if (m.id === myId) big('🦦 HALIT!<small>Te-a mâncat Bamba</small>', 2.2);
      renderScores();
      break;
    }
    case 'hunt':
      sfx.growl();
      if (m.id !== myId) feed(`👀 Bamba a pus ochii pe <b>${nameOf(m.id)}</b>`, 'eat');
      break;
    case 'escaped': feed('😮‍💨 Bamba și-a pierdut prada și s-a pus în fund', 'info'); break;
    case 'tired': feed('😴 Bamba a obosit și s-a pus în fund', 'info'); break;
    case 'fin': {
      const a = actors.get(m.id);
      if (a) a.fin = m.place;
      feed(`🏁 <b>${nameOf(m.id)}</b> a trecut linia pe locul ${m.place}`, 'info');
      if (m.id === myId) { me.fin = m.place; big(`✅ CALIFICAT!<small>Locul ${m.place}</small>`, 2.5); sfx.win(); }
      renderScores();
      break;
    }
    case 'last': {
      const a = actors.get(m.id);
      setTimeout(() => { a?.kill('eat', bamba.mouth()); bamba.chomp = 1; sfx.chomp(); shake = Math.max(shake, 0.7); renderScores(); }, 350);
      const v = `<b>${nameOf(m.id)}</b>`;
      feed(pick([`🐌 ${v} a ajuns ultimul și l-a mâncat Bamba`, `🐌 ${v} a fost prea lent. Bamba a rezolvat.`, `🦦 Bamba l-a halit pe ${v}, ultimul din cursă`]), 'eat');
      big(m.id === myId ? '🐌 ULTIMUL!<small>Te-a mâncat Bamba</small>' : `🐌 ${nameOf(m.id)}<small>a ajuns ultimul și a fost mâncat</small>`, 2.4);
      break;
    }
    case 'next':
      setTimeout(() => { if (phase === 'pause') big(m.mode === 'race' ? '🏁 CURSA<small>Urmează traseul cu obstacole. Ultimul la finish e mâncat de Bamba.</small>' : '🍌 BANANA<small>Urmează banana explozivă. Moare doar unul.</small>', 3); }, 1900);
      break;
    case 'left': feed(`🚪 <b>${m.name}</b> a ieșit din joc`, 'info'); break;
    case 'win':
      sfx.win();
      if (m.id != null) { big(`🏆 ${nameOf(m.id)}<small>${m.id === myId ? 'Ai câștigat! Ești ultimul în viață.' : 'a câștigat meciul'}</small>`, 6); feed(`🏆 <b>${nameOf(m.id)}</b> a câștigat`, 'info'); }
      else big('💀<small>N-a supraviețuit nimeni</small>', 6);
      break;
  }
}

// -------------------------------------------------------------------- input --
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') (e.target.id === 'code' ? $('btn-join') : $('btn-create')).click(); return; }
  keys.add(e.code);
  if (e.code === 'Space') { e.preventDefault(); if (mode === 'race') me.jumpQ = 0.16; else dash(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); dash(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function dash() {
  if (phase !== 'play' || !iAmAlive() || me.dashCd > 0) return;
  me.dashT = 0.18; me.dashCd = 2.5; sfx.dash();
}

const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (touch) {
  show($('btn-dash'), true);
  $('btn-dash').addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'race') me.jumpQ = 0.16; else dash(); });
  const cv = $('game');
  cv.addEventListener('pointerdown', (e) => {
    if (phase === 'menu' || phase === 'lobby') return;
    if (e.clientX > innerWidth * 0.5) { if (cam.lookId == null) { cam.lookId = e.pointerId; cam.lx = e.clientX; cam.ly = e.clientY; } return; }
    if (stick.on) return;
    stick.on = true; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.z = 0;
    ui.stick.style.left = e.clientX + 'px'; ui.stick.style.top = e.clientY + 'px';
    show(ui.stick, true);
  });
  addEventListener('pointermove', (e) => {
    if (e.pointerId === cam.lookId) { look(e.clientX - cam.lx, e.clientY - cam.ly, 2.2); cam.lx = e.clientX; cam.ly = e.clientY; return; }
    if (!stick.on || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy), max = 50;
    if (d > max) { dx *= max / d; dy *= max / d; }
    stick.x = dx / max; stick.z = dy / max;
    ui.stick.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = (e) => {
    if (e.pointerId === cam.lookId) { cam.lookId = null; return; }
    if (e.pointerId !== stick.id) return;
    stick.on = false; stick.x = stick.z = 0; show(ui.stick, false);
    ui.stick.firstElementChild.style.transform = '';
  };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
}

// desktop: click the game to grab the mouse (GTA-style look), Esc to release
const inGameNow = () => phase === 'countdown' || phase === 'play' || phase === 'pause' || phase === 'end';
let rmb = false, usedLook = false;
if (!touch) {
  // hold the RIGHT mouse button and move to turn the camera
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousedown', (e) => {
    if (e.button !== 2 || !inGameNow()) return;
    rmb = true; usedLook = true;
    $('game').requestPointerLock?.()?.catch?.(() => {}); // keeps the cursor from hitting the screen edge
  });
  addEventListener('mouseup', (e) => { if (e.button === 2) { rmb = false; if (document.pointerLockElement) document.exitPointerLock(); } });
  addEventListener('blur', () => { rmb = false; });
  addEventListener('mousemove', (e) => { if (rmb) look(e.movementX, e.movementY); });
}
addEventListener('wheel', (e) => { cam.dist = Math.min(16, Math.max(1.3, cam.dist * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: true });

$('btn-create').addEventListener('click', () => connect({ t: 'create' }));
$('btn-join').addEventListener('click', () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) { $('menu-msg').textContent = 'Codul are 4 litere.'; return; }
  connect({ t: 'join', code });
});
$('btn-start').addEventListener('click', () => { startMusic(); send({ t: 'start' }); });
$('btn-addbot').addEventListener('click', () => send({ t: 'addbot' }));
$('btn-rmbot').addEventListener('click', () => send({ t: 'rmbot' }));
$('btn-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(/^(localhost|127\.)/.test(location.hostname) ? 'https://gusicov.github.io/noapte-suna/?room=' + lobby.code : location.href); $('btn-link').textContent = 'Copiat ✓'; } catch { $('btn-link').textContent = location.href; }
  setTimeout(() => ($('btn-link').textContent = 'Copiază linkul'), 1800);
});
$('name').value = localStorage.getItem('ns_name') || '';
$('code').value = ROOM_FROM_URL;
function inviteMode(on) {
  const j = $('btn-join'), c = $('btn-create'), panel = c.parentElement, row = j.parentElement, or = panel.querySelector('.or');
  j.classList.toggle('primary', on); c.classList.toggle('primary', !on);
  j.textContent = on ? 'Intră în camera ' + $('code').value.toUpperCase() : 'Intră';
  c.textContent = on ? 'Creează altă cameră' : 'Creează cameră';
  or.textContent = on ? 'sau' : 'sau intră la un prieten';
  if (on) { panel.insertBefore(row, c); panel.insertBefore(or, c); } else { panel.insertBefore(c, or); panel.insertBefore(or, row); }
}
if (ROOM_FROM_URL.length === 4) inviteMode(true);
$('code').addEventListener('input', () => { if ($('btn-join').classList.contains('primary')) $('btn-join').textContent = 'Intră în camera ' + $('code').value.toUpperCase(); });

// --------------------------------------------------------------------- loop --
function moveMe(dt, a) {
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  ix += stick.x; iz += stick.z;
  { const c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw), rx = c * ix + sn * iz, rz = -sn * ix + c * iz; ix = rx; iz = rz; }
  const il = Math.hypot(ix, iz);
  const h = HANDLING[a.char] || HANDLING.gluga;
  let sp = SPEED * (bombS.holder === myId ? 1.06 : 1);
  if (h.hop) sp *= 0.62 + 0.6 * a.hop;
  if (il > 0.15) { ix /= Math.max(il, 1); iz /= Math.max(il, 1); me.dx = ix / Math.hypot(ix, iz); me.dz = iz / Math.hypot(ix, iz); }
  else { ix = iz = 0; }
  const k = 1 - Math.exp(-(il > 0.15 ? h.grip : h.slide) * dt);
  me.vx += (ix * sp - me.vx) * k; me.vz += (iz * sp - me.vz) * k;
  let vx = me.vx, vz = me.vz;
  me.dashCd = Math.max(0, me.dashCd - dt);
  if (me.dashT > 0) { me.dashT -= dt; vx = me.dx * SPEED * 2.7; vz = me.dz * SPEED * 2.7; me.vx = me.dx * SPEED; me.vz = me.dz * SPEED; }
  if (mode === 'race') raceStep(dt, a, vx, vz);
  else { me.x += vx * dt; me.z += vz * dt; me.y = 0; collide(me); }
  a.group.position.set(me.x, me.y, me.z);
  const v = Math.hypot(vx, vz);
  a.moving = v > 1.2 ? 1 : 0;
  if (v > 1.2) a.tyaw = Math.atan2(vx, vz);
  ui.dash.style.transform = `scaleX(${1 - me.dashCd / 2.5})`;
  sendT -= dt;
  if (sendT <= 0) { sendT = 0.05; send({ t: 'p', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), ry: +a.tyaw.toFixed(2), m: a.moving }); }
}

function bonk(kx, kz, up) {
  me.kx = kx; me.kz = kz; me.vy = up; me.air = 1; me.hitCd = 0.45;
  shake = Math.max(shake, 0.6); sfx.bonk(); navigator.vibrate?.(60);
}
function raceStep(dt, a, vx, vz) {
  me.jumpQ = Math.max(0, me.jumpQ - dt); me.hitCd = Math.max(0, me.hitCd - dt); me.air += dt;
  if (me.jumpQ > 0 && me.air < 0.13) { me.vy = 12.5; me.air = 1; me.jumpQ = 0; sfx.jump(); }
  me.vy = Math.max(-40, me.vy - 32 * dt);
  const py = me.y;
  me.x += (vx + me.kx) * dt; me.z += (vz + me.kz) * dt; me.y += me.vy * dt;
  const kd = Math.exp(-3.2 * dt); me.kx *= kd; me.kz *= kd;
  const g = courseGround(me.x, me.z, raceT, py);
  if (g && me.vy <= 0 && me.y <= g.y) {
    me.y = g.y; me.vy = 0; me.air = 0; me.x += g.vx * dt;
    for (const p of C.pads) if (p.cp > me.cp && Math.abs(me.x - p.x) <= p.w / 2 && Math.abs(me.z - p.z) <= p.d / 2) { me.cp = p.cp; if (p.cp < 4) { sfx.count(); feed('🚩 Checkpoint!', 'info'); } }
  }
  if (me.hitCd <= 0) {
    // the sweeper bar
    const th = discAngle(raceT), rx = me.x - C.disc.x, rz = me.z - C.disc.z, cs = Math.cos(th), sn = Math.sin(th);
    const along = rx * cs + rz * sn, perp = -rx * sn + rz * cs;
    if (me.y < 1.25 && Math.abs(along) < C.disc.bar && Math.abs(perp) < 0.42 + PR) {
      const sp = (9 + Math.abs(along) * C.disc.speed) * Math.sign(along || 1);
      bonk(-sn * sp, cs * sp, 9);
    }
    // the pistons
    for (let i = 0; i < C.pistons.length; i++) {
      const px = pistonX(i, raceT);
      if (me.y < C.pistonH && Math.abs(me.x - px) < C.pistonW / 2 + PR && Math.abs(me.z - C.pistons[i].z) < C.pistonD / 2 + PR) {
        bonk(Math.sign(pistonVx(i, raceT) || me.x - px) * 19, 0, 7);
      }
    }
    // the rolling balls
    for (let k = 0; k < 4; k++) {
      const b = ballPos(k, raceT);
      if (b && Math.hypot(me.x - b.x, me.y + 0.9 - b.y, me.z - b.z) < C.ball.r + 0.75) bonk(Math.sign(me.x - b.x || 1) * 6, 20, 9);
    }
  }
  if (me.y < C.killY) { // fell off: back to the last checkpoint
    const p = C.pads.find((q) => q.cp === me.cp) || C.pads[0];
    Object.assign(me, { x: p.x + (Math.random() - 0.5) * 4, z: p.z + (me.cp ? 1 : 0), y: p.y + 4, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0 });
    feed(pick(['🫠 Ai căzut în gumă. Înapoi la checkpoint.', '🫠 Pleosc. Mai încearcă o dată.']), 'info');
  }
}

function menuBamba(dt) {
  menuB.t -= dt;
  if (menuB.mode === 'walk') {
    const dx = menuB.gx - bamba.tx, dz = menuB.gz - bamba.tz, d = Math.hypot(dx, dz);
    if (d < 1 || menuB.t <= 0) { menuB.mode = 'sit'; menuB.t = 2.5 + Math.random() * 2.5; bamba.st = 'sit'; }
    else { bamba.tx += (dx / d) * 7 * dt; bamba.tz += (dz / d) * 7 * dt; bamba.tyaw = Math.atan2(dx, dz); }
  } else if (menuB.t <= 0) {
    menuB.mode = 'walk'; menuB.t = 7; bamba.st = 'chase';
    menuB.gx = (Math.random() * 2 - 1) * (HX - 6); menuB.gz = (Math.random() * 2 - 1) * (HZ - 4);
  }
}

function makeDemo() {
  demo = CHARS.map((c, i) => {
    const a = new Actor(scene, c.id, c.name, COLORS[i]);
    a.place(-10 + i * 5.5, 15 - (i % 2) * 2, 0.3);
    return a;
  });
}

const camPos = new THREE.Vector3(0, 30, 50), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; time += dt;
  const inGame = phase === 'countdown' || phase === 'play' || phase === 'pause' || phase === 'end';

  if (!inGame) menuBamba(dt);
  if (mode === 'race') { if (phase === 'play') raceT += dt; course.update(raceT); }
  bamba.baseY = mode === 'race' ? C.finishY : 0;
  bamba.update(dt, time);

  const mine = myActor();
  if (phase === 'play' && mine?.alive) moveMe(dt, mine);
  else if (mine) { mine.moving = 0; me.vx = me.vz = 0; }

  const k = 1 - Math.exp(-14 * dt);
  for (const [id, a] of actors) {
    if (a.alive && !(id === myId && phase === 'play')) {
      a.group.position.x += (a.tx - a.group.position.x) * k;
      a.group.position.z += (a.tz - a.group.position.z) * k;
      a.group.position.y += ((a.ty || 0) - a.group.position.y) * k;
    }
    a.update(dt, time, inGame && bombS.holder === id);
    a.label.visible = camera.position.distanceToSquared(a.group.position) > 49;
  }
  for (const a of demo) a.update(dt, time, false);

  // countdown
  if (phase === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastCount && n > 0) { lastCount = n; big(String(n)); sfx.count(); }
  }
  if (bigTimer > 0) { bigTimer -= dt; if (bigTimer <= 0) ui.big.innerHTML = ''; }

  // bomb
  const holder = actors.get(bombS.holder);
  bomb.visible = !!holder && holder.alive && (phase === 'countdown' || phase === 'play');
  if (bomb.visible) {
    { // held at his side, like a very large, very yellow phone
      const hy = holder.group.rotation.y, cy = Math.cos(hy), sy = Math.sin(hy), ox = 0.62, oz = 0.28;
      tmp.set(holder.group.position.x + ox * cy + oz * sy, holder.group.position.y + 1.02 + holder.tilt.position.y, holder.group.position.z - ox * sy + oz * cy);
      bomb.position.lerp(tmp, 1 - Math.exp(-20 * dt));
      bomb.rotation.set(0, hy, -0.35 + Math.sin(time * 9) * 0.12);
    }
    const u = phase === 'play' ? Math.min(1, Math.max(0, 1 - bombS.left / bombS.total)) : 0;
    bombS.tickT -= dt;
    if (phase === 'play' && bombS.tickT <= 0) { bombS.tickT = 0.8 - 0.69 * Math.pow(u, 1.4); bombS.punch = Math.max(bombS.punch, 0.7); sfx.tick(u); }
    bombS.punch = Math.max(0, bombS.punch - dt * 5);
    const { body, light } = bomb.userData;
    bomb.scale.setScalar(1 + bombS.punch * 0.4 + u * 0.3);
    body.material.emissiveIntensity = 0.3 + bombS.punch * (0.5 + u * 2.2);
    body.material.emissive.setHex(bombS.punch > 0.25 ? 0xff2200 : 0xff7a00);
    light.intensity = 3 + bombS.punch * 26;
  }

  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    b.t += dt;
    const q = Math.min(1, b.t / 0.6);
    b.ball.scale.setScalar(1 + q * 7); b.ball.material.opacity = 1 - q; b.ball.visible = q < 1;
    b.ring.scale.setScalar(1 + q * 14); b.ring.material.opacity = 1 - q; b.ring.visible = q < 1;
  }

  // banner + vignette
  if (inGame && lobby) {
    const hunted = mode !== 'race' && bamba.st === 'chase' && bamba.target === myId && iAmAlive() && phase === 'play';
    if (phase === 'end' || phase === 'pause') setBanner('');
    else if (mode === 'race') {
      if (!iAmAlive()) setBanner('👻 Ești pe margine. Te uiți la cursă.');
      else if (me.fin) setBanner('✅ Calificat! Îi aștepți pe ceilalți…');
      else setBanner(`🏁 Fugi la finish! Ultimul e mâncat · ⏱ ${timeLeft}s`, timeLeft <= 10 ? 'hot' : '');
    }
    else if (hunted) setBanner('🦦 BAMBA VINE DUPĂ TINE! FUGI!', 'bamba');
    else if (bombS.holder === myId) setBanner('🍌 AI BANANA! Atinge pe cineva!', 'hot');
    else if (!iAmAlive()) setBanner('👻 Ești pe margine. Runda viitoare joci iar.');
    else if (bombS.holder != null) setBanner(`Fugi de ${nameOf(bombS.holder)}! Are banana 🍌`);
    ui.vignette.className = hunted ? '' : 'hot';
    ui.vignette.style.opacity = hunted ? 0.55 + Math.sin(time * 12) * 0.25 : (mode !== 'race' && bombS.holder === myId && phase === 'play' ? 0.2 : 0);
  }

  // camera
  if (inGame) {
    let fx = 0, fz = 0, fy = 0;
    const follow = mine?.alive ? mine : (holder?.alive ? holder : [...actors.values()].find((q) => q.alive && !q.fin) || [...actors.values()].find((q) => q.alive));
    if (follow) { fx = follow.group.position.x; fz = follow.group.position.z; fy = Math.max(-6, follow.group.position.y); }
    else if (phase === 'play') { fx = bamba.x; fz = bamba.z; }
    const spect = !mine?.alive;
    if (spect && phase === 'play' && !rmb && cam.lookId == null) cam.yaw += dt * 0.15;
    tmp.set(fx, fy + PLAYER_H * 0.86, fz);
    if (mode === 'race') { world.sun.position.set(fx - 26, fy + 46, fz + 22); world.sun.target.position.set(fx, fy, fz); }
    camLook.lerp(tmp, 1 - Math.exp(-(spect ? 4 : 18) * dt));
    if (!spect) { camLook.x = tmp.x; camLook.z = tmp.z; }
    const D = cam.dist * (spect ? 1.8 : 1) * (camera.aspect < 1 ? 1.25 : 1), cp = Math.cos(cam.pitch);
    camPos.set(camLook.x + Math.sin(cam.yaw) * cp * D, Math.max(mode === 'race' ? -30 : 0.25, camLook.y + Math.sin(cam.pitch) * D), camLook.z + Math.cos(cam.yaw) * cp * D);
    show($('hint'), !touch && !usedLook);
  } else {
    camAngle += dt * 0.09;
    tmp.set(Math.sin(camAngle) * 50, 21, Math.cos(camAngle) * 44);
    camPos.lerp(tmp, 1 - Math.exp(-2 * dt));
    tmp.set(bamba.x * 0.3, 2, bamba.z * 0.3);
    camLook.lerp(tmp, 1 - Math.exp(-2 * dt));
    show($('hint'), false);
  }
  shake = Math.max(0, shake - dt * 2.4);
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(tmp.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
  camera.lookAt(camLook);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// --------------------------------------------------------------------- boot --
initAudio();
wake();
loadModels((p) => (ui.loading.textContent = `Se încarcă… ${Math.round(p * 100)}%`)).then(() => {
  ui.loading.remove();
  thumbs = portraits();
  buildCharCards();
  bamba = new Bamba(scene);
  makeDemo();
  requestAnimationFrame((t) => { last = t; frame(t); });
}).catch((e) => { ui.loading.textContent = 'Nu s-au putut încărca modelele: ' + e.message; });

// handy for debugging from the console
window.__ns = { cam, get mode() { return mode; }, get raceT() { return raceT; }, get phase() { return phase; }, actors, me, get bamba() { return bamba; }, bombS, keys };
