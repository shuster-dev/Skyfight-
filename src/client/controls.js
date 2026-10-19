// The stick and the triggers. On a keyboard: arrows or WASD to fly, space to
// shoot, shift for the burner, E for a missile. On a phone: a stick that
// appears wherever the left thumb lands, and three buttons for the right.
const $ = (s) => document.querySelector(s);

export class Controls {
  constructor() {
    this.keys = new Set();
    this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.fireHeld = false; this.boostHeld = false;
    this.missileQueued = false;
    this.flareQueued = false;
    this.invert = (() => { try { return localStorage.getItem('sky.invert') === '1'; } catch { return false; } })();
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.enabled = false;
    this.look = { yaw: 0, pitch: 0, held: false, at: 0, lx: 0, ly: 0 };
    this.lookId = null;

    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'KeyF') this.missileQueued = true;
      if (e.code === 'KeyQ' || e.code === 'KeyR') this.flareQueued = true;
      if (e.code === 'KeyH' && this.canHover) this.setHover(!this.hover);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fireHeld = this.boostHeld = false; this.stick.id = null; this.stick.x = this.stick.y = 0; this.paintStick(); });
    const canvas = $('#game');
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (e.button === 0) this.fireHeld = true;
      // the right button held: look around (dragged, see below)
      if (e.button === 2) this.lookStart(e);
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && !this.touch) this.fireHeld = false;
      if (e.button === 2) this.lookEnd();
    });
    addEventListener('mousemove', (e) => this.lookMove(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // the stick: wherever the left thumb lands on the left half
    const pad = $('#touch-pad');
    pad.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return;
      this.stick.id = e.pointerId; this.stick.ox = e.clientX; this.stick.oy = e.clientY;
      try { pad.setPointerCapture(e.pointerId); } catch {}
      this.moveStick(e);
    });
    pad.addEventListener('pointermove', (e) => e.pointerId === this.stick.id && this.moveStick(e));
    const end = (e) => { if (e.pointerId !== this.stick.id) return; this.stick.id = null; this.stick.x = this.stick.y = 0; this.paintStick(); };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);

    // free look: the right thumb drags the camera round the plane, the way
    // the camera turns in Hobile; let go and it slides back behind
    const look = $('#look-pad');
    look.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      try { look.setPointerCapture(e.pointerId); } catch {}
      this.lookStart(e);
    });
    look.addEventListener('pointermove', (e) => e.pointerId === this.lookId && this.lookMove(e));
    const lookUp = (e) => { if (e.pointerId === this.lookId) this.lookId = null, this.lookEnd(); };
    look.addEventListener('pointerup', lookUp);
    look.addEventListener('pointercancel', lookUp);

    const hold = (sel, key) => {
      const b = $(sel);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {} this[key] = true; b.classList.add('on'); });
      const up = () => { this[key] = false; b.classList.remove('on'); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    };
    hold('#btn-fire', 'fireHeld');
    hold('#btn-boost', 'boostHeld');
    hold('#btn-brake', 'brakeHeld');
    $('#btn-missile').addEventListener('pointerdown', (e) => { e.preventDefault(); this.missileQueued = true; });
    $('#btn-flare').addEventListener('pointerdown', (e) => { e.preventDefault(); this.flareQueued = true; });
    // hover (a plane that can): a switch, not a hold
    $('#btn-hover').addEventListener('pointerdown', (e) => { e.preventDefault(); this.setHover(!this.hover); });
  }

  /** Standing in the air, or flying: the plane says whether it can (canHover). */
  setHover(on) {
    this.hover = !!on && !!this.canHover;
    $('#btn-hover').classList.toggle('on', this.hover);
    this.onHover?.(this.hover);
  }

  lookStart(e) {
    if (!this.enabled) return;
    this.look.held = true;
    this.look.lx = e.clientX; this.look.ly = e.clientY;
  }
  lookMove(e) {
    if (!this.look.held) return;
    const k = 5.5 / Math.max(innerWidth, innerHeight);
    this.look.yaw -= (e.clientX - this.look.lx) * k;
    this.look.pitch += (e.clientY - this.look.ly) * k * 0.8;
    this.look.yaw = Math.max(-Math.PI, Math.min(Math.PI, this.look.yaw));
    this.look.pitch = Math.max(-0.7, Math.min(1.0, this.look.pitch));
    this.look.lx = e.clientX; this.look.ly = e.clientY;
  }
  lookEnd() { this.look.held = false; this.look.at = performance.now(); }
  /** Per frame: a look let go of drifts back behind the plane. */
  settleLook(dt) {
    const l = this.look;
    if (l.held || performance.now() - l.at < 600) return l;
    const k = Math.min(1, dt * 4);
    l.yaw -= l.yaw * k; l.pitch -= l.pitch * k;
    if (Math.abs(l.yaw) < 0.01) l.yaw = 0;
    if (Math.abs(l.pitch) < 0.01) l.pitch = 0;
    return l;
  }

  moveStick(e) {
    const R = 60;
    let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
    const d = Math.hypot(dx, dy);
    // the origin follows a thumb that runs past the edge, so it never sticks
    if (d > R) { this.stick.ox += dx * (1 - R / d); this.stick.oy += dy * (1 - R / d); dx *= R / d; dy *= R / d; }
    this.stick.x = dx / R; this.stick.y = dy / R;
    this.paintStick();
  }

  paintStick() {
    const base = $('#stick'), knob = $('#stick-knob');
    if (this.stick.id === null) { base.classList.add('hidden'); return; }
    base.classList.remove('hidden');
    base.style.transform = `translate(${this.stick.ox - 70}px, ${this.stick.oy - 70}px)`;
    knob.style.transform = `translate(${this.stick.x * 50}px, ${this.stick.y * 50}px)`;
  }

  setInvert(v) {
    this.invert = !!v;
    try { localStorage.setItem('sky.invert', v ? '1' : '0'); } catch {}
  }

  /** The stick, as the flight model wants it. */
  read() {
    const k = (c) => this.keys.has(c);
    let turn = (k('ArrowRight') || k('KeyD') ? 1 : 0) - (k('ArrowLeft') || k('KeyA') ? 1 : 0);
    let climb = (k('ArrowUp') || k('KeyW') ? 1 : 0) - (k('ArrowDown') || k('KeyS') ? 1 : 0);
    if (this.stick.id !== null) {
      // a little dead zone, then a curve: fine control near the middle
      const curve = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.08) / 0.92;
      turn = curve(this.stick.x);
      climb = -curve(this.stick.y);
      turn = Math.sign(turn) * turn * turn * 0.4 + turn * 0.6;
    }
    if (this.invert) climb = -climb;
    const missile = this.missileQueued, flare = this.flareQueued;
    this.missileQueued = false;
    this.flareQueued = false;
    return {
      turn, climb,
      boost: this.boostHeld || k('ShiftLeft') || k('ShiftRight'),
      brake: this.brakeHeld || k('KeyB') || k('KeyC') || k('ControlLeft'),
      fire: this.fireHeld || k('Space'),
      hover: !!this.hover,
      missile, flare,
    };
  }
}
