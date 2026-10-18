// Sound, made on the spot: no files. Everything is built from noise and a
// few oscillators, shaped the way the real thing is:
//
//   the engine     a jet: a soft low rumble and a faint turbine whine that
//                  climbs with speed, the burner's roar only while lit; the piston fighter: a throbbing
//                  exhaust beat with the propeller's buzz on it
//   the guns       each its own report — the light gun's crack, the heavy
//                  gun's bark, a cannon's thump, the rotary cannon's tearing
//                  buzz
//   the seeker     the heat-seeker's growl in the headset: a soft low warble
//                  while it searches, a short high tone when it locks
//   the missile    the clunk off the rail and the rocket motor's roar fading
//                  away ahead
//   the warning    the missile-launch warning's fast double beep, quicker as
//                  it closes; a flare's pops and hiss; explosions with a
//                  thump, a rumble and debris crackling after
//
// All of it through one compressor, so a dogfight is loud without breaking up.
let ctx = null, master = null, bus = null, engine = null, seeker = null, noiseBuf = null, brownBuf = null;
let plane = 'jet';
let muted = (() => { try { return localStorage.getItem('sky.mute') === '1'; } catch { return false; } })();

const now = () => ctx.currentTime;
const VOL = 0.55;

export const sound = {
  get muted() { return muted; },
  setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('sky.mute', v ? '1' : '0'); } catch {}
    master && master.gain.setTargetAtTime(muted ? 0 : VOL, now(), 0.05);
  },
  /** Browsers want a touch before any sound: call from one. */
  unlock() {
    if (ctx) return ctx.state === 'suspended' && ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    bus = ctx.createGain();
    bus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    // white noise, and brown (deep, for rumble)
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    brownBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = noiseBuf.getChannelData(0), b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
  },

  /** Which engine to hear: the piston fighter's, or a jet's. */
  setPlane(kind) {
    const want = kind === 'sparrow' ? 'prop' : 'jet';
    if (want === plane) return;
    plane = want;
    if (engine) { engine.stop(); engine = null; }
  },

  /** The engine: on while flying, following the speed and the burner. */
  engine(on, speed = 60, boost = false) {
    if (!ctx) return;
    if (!on) { if (engine) engine.fade(); return; }
    if (!engine) engine = plane === 'prop' ? propEngine() : jetEngine();
    engine.set(speed, boost);
  },

  /**
   * One round from my guns, by the gun: 'g1' light, 'g2' heavy, 'g3' 20 mm
   * cannon, 'g4' rotary, 'g5' 30 mm.
   */
  shot(gun = 'g1') {
    if (!live()) return;
    const t = now(), j = 1 + (Math.random() - 0.5) * 0.12;
    switch (gun) {
      case 'g2': crack(t, 0.06, 1800 * j, 0.3); thump(t, 140 * j, 55, 0.07, 0.35); break;
      case 'g3': crack(t, 0.07, 1300 * j, 0.24); thump(t, 110 * j, 40, 0.12, 0.6); break;
      case 'g4': crack(t, 0.035, 2600 * j, 0.18); thump(t, 160 * j, 80, 0.04, 0.22); break;
      case 'g5': crack(t, 0.09, 900 * j, 0.28); thump(t, 90 * j, 32, 0.18, 0.8); noise(t + 0.02, 0.25, 'lowpass', 500, 120, 0.18, brownBuf); break;
      default: crack(t, 0.045, 2400 * j, 0.24); thump(t, 180 * j, 70, 0.045, 0.2);
    }
  },

  /**
   * The seeker's voice in the headset: 'search' (a target in the cone, not
   * yet held: a low warble), 'lock' (held and in reach: a steady high tone),
   * or 'off'.
   */
  seeker(state) {
    if (!ctx) return;
    if (!seeker) seeker = seekerVoice();
    seeker.set(muted ? 'off' : state);
  },

  /** A missile off the rail: the clunk, the motor lighting, its roar going away. */
  launch() {
    if (!live()) return;
    const t = now();
    thump(t, 70, 40, 0.08, 0.5);
    noise(t + 0.03, 0.12, 'highpass', 2500, 2500, 0.35);
    noise(t + 0.05, 1.4, 'bandpass', 1400, 280, 0.55, noiseBuf, 1.2);
    noise(t + 0.05, 1.6, 'lowpass', 600, 120, 0.45, brownBuf);
  },

  /** Flares out: a string of pops, and the hiss of them burning. */
  flare() {
    if (!live()) return;
    const t = now();
    for (let i = 0; i < 6; i++) { crack(t + i * 0.055, 0.03, 3000 + Math.random() * 1500, 0.16); thump(t + i * 0.055, 220, 120, 0.03, 0.12); }
    noise(t + 0.05, 1.1, 'highpass', 4000, 2500, 0.12);
  },

  /** My rounds striking home: a hard metallic tick. */
  hit() {
    if (!live()) return;
    const t = now();
    noise(t, 0.03, 'highpass', 5000, 5000, 0.22);
    tone(t, 2300 + Math.random() * 400, 0.05, 0.08, 'triangle', 1500);
  },

  /** Hit myself: a thud through the airframe and a clang. */
  hurt() {
    if (!live()) return;
    const t = now();
    thump(t, 90, 45, 0.12, 0.55);
    tone(t, 520, 0.18, 0.12, 'square', 300);
    noise(t, 0.15, 'bandpass', 1500, 600, 0.25);
  },

  /** An explosion, quieter the further off (`near` 0..1). */
  boom(near = 1) {
    if (!live() || near < 0.03) return;
    const t = now(), v = Math.min(1, near);
    thump(t, 80, 28, 0.5, 1.1 * v);
    noise(t, 1.6, 'lowpass', 900, 60, 0.9 * v, brownBuf);
    noise(t, 0.25, 'bandpass', 2200, 700, 0.35 * v);
    // debris crackling after
    for (let i = 0; i < 5; i++) crack(t + 0.15 + Math.random() * 0.6, 0.025, 2000 + Math.random() * 2000, 0.07 * v);
  },

  /** The missile-launch warning: a fast double beep. */
  warn() {
    if (!live()) return;
    const t = now();
    tone(t, 1000, 0.07, 0.16, 'square');
    tone(t + 0.1, 1000, 0.07, 0.16, 'square');
  },
  /** The warning's beat as the missile closes: higher once it is time to break. */
  beep(close) {
    if (!live()) return;
    const t = now();
    tone(t, close ? 1500 : 1100, 0.045, 0.13, 'square');
    if (close) tone(t + 0.055, 1500, 0.045, 0.13, 'square');
  },
  /** Someone on my tail: a low, short two-note warning. */
  tail() {
    if (!live()) return;
    const t = now();
    tone(t, 420, 0.09, 0.09, 'square');
    tone(t + 0.12, 330, 0.12, 0.09, 'square');
  },
  /** A missile tearing past, close: a rush that drops in pitch as it goes. */
  whoosh() {
    if (!live()) return;
    const t = now();
    noise(t, 0.9, 'bandpass', 3200, 350, 0.45, noiseBuf, 2);
    noise(t, 0.8, 'lowpass', 400, 90, 0.3, brownBuf);
  },

  /** A note on screen: a soft two-tone chime, brighter for good news. */
  note(good) { if (!live()) return; const t = now(); tone(t, good ? 1568 : 1319, 0.12, 0.05, 'sine'); tone(t + 0.07, good ? 2093 : 1760, 0.18, 0.04, 'sine'); },
  level() { if (!live()) return; const t = now(); [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, f, 0.16, 0.18, 'triangle')); },
  coin() { if (!live()) return; const t = now(); tone(t, 988, 0.07, 0.14, 'triangle'); tone(t + 0.07, 1319, 0.12, 0.14, 'triangle'); },
  /** A flick through the market: a short soft click. */
  tick() { if (!live()) return; tone(now(), 1800, 0.025, 0.05, 'sine', 1200); },
};

const live = () => ctx && !muted;

// ---- the building blocks ------------------------------------------------------

/** A tone, gliding to `to` if given. */
function tone(t, freq, dur, vol, type = 'sine', to = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  to && o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
}

/** Noise through a filter that sweeps from `f0` to `f1`, dying away over `dur`. */
function noise(t, dur, kind, f0, f1, vol, buf = noiseBuf, q = 0.8) {
  const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  n.buffer = buf;
  f.type = kind; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  n.connect(f); f.connect(g); g.connect(bus);
  n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05);
}

/** The sharp front of a report: a very short burst of bright noise. */
const crack = (t, dur, freq, vol) => noise(t, dur, 'highpass', freq, freq, vol);

/** A low punch: a sine that drops fast in pitch (the body of a gunshot or a blast). */
function thump(t, f0, f1, dur, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
}

/** A looping noise source through a filter into a gain: a bed for the engines. */
function bed(buf, kind, freq, q = 0.7) {
  const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  n.buffer = buf; n.loop = true;
  f.type = kind; f.frequency.value = freq; f.Q.value = q;
  g.gain.value = 0;
  n.connect(f); f.connect(g);
  n.start(0, Math.random() * 1.5);
  return { n, f, g };
}

// ---- the engines --------------------------------------------------------------

/**
 * A jet: a low, soft rumble under you and the turbine's faint whine — a
 * bed, not a noise: no hiss. The burner adds a roar only while it is lit.
 */
function jetEngine() {
  const out = ctx.createGain(); out.gain.value = 0; out.connect(bus);
  const rumble = bed(brownBuf, 'lowpass', 140);
  const roar = bed(brownBuf, 'lowpass', 500, 0.5);
  const whine = ctx.createOscillator(), wg = ctx.createGain();
  whine.type = 'sine'; wg.gain.value = 0.006; whine.connect(wg);
  for (const x of [rumble.g, roar.g, wg]) x.connect(out);
  whine.start();
  return {
    set(speed, boost) {
      const t = now(), k = Math.min(1.6, speed / 70);
      out.gain.setTargetAtTime(0.16, t, 0.3);
      rumble.g.gain.setTargetAtTime(boost ? 0.5 : 0.32, t, 0.3);
      rumble.f.frequency.setTargetAtTime(110 + k * 40, t, 0.3);
      roar.g.gain.setTargetAtTime(boost ? 0.35 : 0, t, 0.25);
      whine.frequency.setTargetAtTime(1100 + k * 700, t, 0.5);
    },
    fade() { out.gain.setTargetAtTime(0, now(), 0.25); },
    stop() { out.gain.setTargetAtTime(0, now(), 0.05); const s = [rumble.n, roar.n, whine]; setTimeout(() => s.forEach((x) => x.stop()), 300); },
  };
}

/**
 * A piston fighter: the exhaust's throb (a pulse at the firing rate, on a
 * low growl), the propeller's buzz on top.
 */
function propEngine() {
  const out = ctx.createGain(); out.gain.value = 0; out.connect(bus);
  const growl = ctx.createOscillator(), gf = ctx.createBiquadFilter(), gg = ctx.createGain();
  growl.type = 'sawtooth'; gf.type = 'lowpass'; gf.frequency.value = 420; gf.Q.value = 2;
  growl.connect(gf); gf.connect(gg); gg.gain.value = 0.25;
  // the beat: the growl's level pulsed by a low oscillator
  const beat = ctx.createOscillator(), bd = ctx.createGain();
  beat.type = 'square'; bd.gain.value = 0.12;
  beat.connect(bd); bd.connect(gg.gain);
  const rush = bed(brownBuf, 'lowpass', 500);
  const buzz = ctx.createOscillator(), bz = ctx.createBiquadFilter(), bg = ctx.createGain();
  buzz.type = 'square'; bz.type = 'bandpass'; bz.frequency.value = 900; bz.Q.value = 1.5; bg.gain.value = 0.03;
  buzz.connect(bz); bz.connect(bg);
  for (const x of [gg, rush.g, bg]) x.connect(out);
  growl.start(); beat.start(); buzz.start();
  return {
    set(speed, boost) {
      const t = now(), k = Math.min(1.6, speed / 60);
      out.gain.setTargetAtTime(0.2, t, 0.3);
      growl.frequency.setTargetAtTime(48 + k * 26 + (boost ? 14 : 0), t, 0.3);
      beat.frequency.setTargetAtTime(22 + k * 12 + (boost ? 6 : 0), t, 0.3);
      gf.frequency.setTargetAtTime(boost ? 900 : 420 + k * 120, t, 0.2);
      rush.g.gain.setTargetAtTime(0.04 + (boost ? 0.12 : 0), t, 0.3);
      buzz.frequency.setTargetAtTime(95 + k * 40, t, 0.3);
    },
    fade() { out.gain.setTargetAtTime(0, now(), 0.25); },
    stop() { out.gain.setTargetAtTime(0, now(), 0.05); const s = [growl, beat, rush.n, buzz]; setTimeout(() => s.forEach((x) => x.stop()), 300); },
  };
}

/**
 * The heat-seeker's tone: one oscillator, warbled by a slow one while it
 * searches, steady and higher with a lock.
 */
function seekerVoice() {
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = 520;
  lfo.type = 'sine'; lfo.frequency.value = 11; depth.gain.value = 0;
  lfo.connect(depth); depth.connect(o.frequency);
  g.gain.value = 0;
  o.connect(g); g.connect(bus);
  o.start(); lfo.start();
  let state = 'off';
  return {
    set(s) {
      if (s === state) return;
      state = s;
      const t = now();
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      if (s === 'off') { g.gain.setTargetAtTime(0, t, 0.03); return; }
      if (s === 'search') { o.frequency.setTargetAtTime(560, t, 0.05); depth.gain.setTargetAtTime(45, t, 0.05); g.gain.setTargetAtTime(0.022, t, 0.04); }
      else {
        // the lock: a short clear tone, then quiet — it has told you
        o.frequency.setTargetAtTime(1250, t, 0.02); depth.gain.setTargetAtTime(0, t, 0.02);
        g.gain.setTargetAtTime(0.035, t, 0.02);
        g.gain.setTargetAtTime(0, t + 0.28, 0.05);
      }
    },
  };
}
