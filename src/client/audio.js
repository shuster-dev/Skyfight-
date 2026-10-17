// Sound, made on the spot: no files. An engine that rises with speed and
// roars with the burner, guns, hits, booms, the lock-on warning.
let ctx = null, master = null, engine = null, noiseBuf = null;
let muted = (() => { try { return localStorage.getItem('sky.mute') === '1'; } catch { return false; } })();

export const sound = {
  get muted() { return muted; },
  setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('sky.mute', v ? '1' : '0'); } catch {}
    master && (master.gain.value = muted ? 0 : 0.5);
  },
  /** Browsers want a touch before any sound: call from one. */
  unlock() {
    if (ctx) return ctx.state === 'suspended' && ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  /** The engine: on while flying, its pitch and roar following speed and burner. */
  engine(on, speed = 60, boost = false) {
    if (!ctx) return;
    if (!on) { if (engine) { engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); } return; }
    if (!engine) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 500;
      const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const ng = ctx.createGain(); ng.gain.value = 0;
      o.connect(f); o2.connect(f); n.connect(ng); ng.connect(f); f.connect(g); g.connect(master);
      g.gain.value = 0;
      o.start(); o2.start(); n.start();
      engine = { o, o2, f, g, ng };
    }
    const t = ctx.currentTime;
    engine.o.frequency.setTargetAtTime(38 + speed * 0.55, t, 0.1);
    engine.o2.frequency.setTargetAtTime(19 + speed * 0.28, t, 0.1);
    engine.f.frequency.setTargetAtTime(boost ? 1400 : 520, t, 0.15);
    engine.ng.gain.setTargetAtTime(boost ? 0.5 : 0.08, t, 0.15);
    engine.g.gain.setTargetAtTime(0.11, t, 0.2);
  },
  shot(heavy) { heavy ? burst(0.09, 700, 0.22, 'lowpass', 160) : burst(0.045, 2400, 0.13, 'bandpass'); },
  hit() { tone(1300, 0.05, 0.12, 'square', 2200); },
  hurt() { burst(0.12, 600, 0.3, 'lowpass'); },
  boom(near = 1) { burst(0.9, 260, 0.9 * near, 'lowpass', 70); },
  launch() { burst(0.6, 900, 0.35, 'bandpass', 2400); },
  flare() { burst(0.35, 3000, 0.12, 'highpass', 1200); },
  warn() { tone(880, 0.09, 0.18, 'square'); setTimeout(() => tone(880, 0.09, 0.18, 'square'), 140); },
  /** The missile warning's beep: higher when it is time to break. */
  beep(now) { tone(now ? 1320 : 990, 0.05, 0.12, 'square'); },
  /** A missile going past, close. */
  whoosh() { burst(0.7, 1800, 0.3, 'bandpass', 300); },
  level() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.2, 'triangle'), i * 110)); },
  coin() { tone(988, 0.07, 0.15, 'triangle'); setTimeout(() => tone(1319, 0.12, 0.15, 'triangle'), 70); },
};

function tone(freq, dur, vol, type = 'sine', to = 0) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  to && o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function burst(dur, freq, vol, kind = 'lowpass', to = 0) {
  if (!ctx || muted) return;
  const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime;
  n.buffer = noiseBuf;
  f.type = kind; f.frequency.setValueAtTime(freq, t);
  to && f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f); f.connect(g); g.connect(master);
  n.start(t, Math.random() * 0.5); n.stop(t + dur);
}
