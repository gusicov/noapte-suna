const music = document.getElementById('music');
const btn = document.getElementById('btn-mute');
const slider = document.getElementById('vol');
let ctx = null, noise = null;
let muted = localStorage.getItem('ns_muted') === '1';
let vol = +(localStorage.getItem('ns_vol') ?? 45);

function apply() {
  music.volume = (vol / 100) * 0.8;
  music.muted = muted;
  btn.textContent = muted ? '🔇' : vol === 0 ? '🔈' : '🔊';
  slider.value = vol;
}

export function initAudio() {
  apply();
  btn.addEventListener('click', () => { muted = !muted; localStorage.setItem('ns_muted', muted ? '1' : '0'); apply(); });
  slider.addEventListener('input', () => { vol = +slider.value; localStorage.setItem('ns_vol', vol); if (muted && vol > 0) { muted = false; localStorage.setItem('ns_muted', '0'); } apply(); });
}

// must be called from a click/tap
export function startMusic() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { /* no web audio */ }
  }
  ctx?.resume?.();
  music.play().catch(() => {});
}

function tone(freq, dur, type = 'sine', gain = 0.2, slideTo = null, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}

function burst(dur, gain, cutoff) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(ctx.destination); s.start(t); s.stop(t + dur);
}

export const sfx = {
  tick: (u) => tone(700 + u * 900, 0.05, 'square', 0.05 + u * 0.06),
  pass: () => { tone(300, 0.14, 'triangle', 0.25, 900); tone(900, 0.1, 'sine', 0.12, 1400, 0.06); },
  boom: () => { burst(1.1, 0.9, 2400); tone(110, 0.9, 'sawtooth', 0.4, 28); },
  chomp: () => { burst(0.16, 0.6, 900); tone(160, 0.2, 'square', 0.25, 60, 0.05); tone(120, 0.25, 'square', 0.2, 50, 0.22); },
  growl: () => { tone(85, 0.7, 'sawtooth', 0.22, 55); tone(92, 0.7, 'sawtooth', 0.15, 50); },
  count: () => tone(520, 0.12, 'triangle', 0.2),
  go: () => { tone(780, 0.3, 'triangle', 0.25); tone(1040, 0.35, 'triangle', 0.2, null, 0.08); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.22, null, i * 0.13)),
  dash: () => burst(0.18, 0.18, 3000),
};
