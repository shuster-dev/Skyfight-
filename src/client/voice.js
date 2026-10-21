// Voice in the sky. Each pilot who has it on is joined to every other one
// in the room, device to device (WebRTC: the server only passes the
// handshake along). What comes in plays through the Web Audio graph: a gain
// that follows the distance — full near, fading to silence at 500 m, gliding
// so a voice comes up and dies away rather than snapping — and a panner, so
// it comes from where the plane is.
//
// Modes: 'off' (no voice at all, the default), 'listen' (hear, never send),
// 'ptt' (send while the button or V is held), 'open' (send unless muted).
import { VOICE, voiceGain } from '../shared/voice.js';

const MODES = ['off', 'listen', 'ptt', 'open'];

export class Voice {
  /** `send(type, msg)` to the room; `ice()` resolves to the ICE servers. */
  constructor({ send, ice, onChange }) {
    this.send = send;
    this.iceP = null;
    this.ice = ice;
    this.onChange = onChange || (() => {});
    this.mode = (() => { try { const m = localStorage.getItem('sky.voice'); return MODES.includes(m) ? m : 'off'; } catch { return 'off'; } })();
    this.peers = new Map();   // key -> { pc, gain, pan, an, el, buf, talking, level, retryAt }
    this.muted = new Set();   // keys I do not want to hear
    this.held = false;        // the push-to-talk button
    this.selfMute = false;    // open mic, muted for now
    this.on = false;          // in a room with voice running
    this.myKey = '';
    this.stream = null;       // my microphone
    this.ctx = null;
    this.micLevel = 0;
    this.micDenied = false;
    this.retry = new Map();   // key -> when a failed line may be tried again
  }

  /** Make the audio context from a tap (browsers want one first). */
  prime() {
    if (this.mode === 'off') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get sends() { return this.mode === 'open' || this.mode === 'ptt'; }
  /** Am I on the air right now? */
  get live() { return !!this.stream && (this.mode === 'open' ? !this.selfMute : this.mode === 'ptt' ? this.held : false); }

  setMode(m) {
    if (!MODES.includes(m) || m === this.mode) return;
    this.mode = m;
    try { localStorage.setItem('sky.voice', m); } catch {}
    // in the air: the change takes now (turning it on from off as well)
    if (this.inRoom) { const key = this.myKey; this.stop(); if (m !== 'off') this.prime(), this.start(key); else this.inRoom = true; }
    this.onChange();
  }

  /** Into a room: the microphone (if sending), then tell the room voice is on. */
  async start(myKey) {
    this.myKey = myKey;
    this.inRoom = true;
    if (this.mode === 'off' || this.on) return this.onChange();
    this.on = true;
    this.prime();
    if (this.sends && !this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        this.micDenied = false;
        if (this.ctx) {
          const an = this.ctx.createAnalyser(); an.fftSize = 256;
          const hush = this.ctx.createGain(); hush.gain.value = 0; // my own voice is metered, not played back
          this.ctx.createMediaStreamSource(this.stream).connect(an); an.connect(hush); hush.connect(this.ctx.destination);
          this.micAn = an; this.micBuf = new Float32Array(an.fftSize);
        }
      } catch { this.micDenied = true; this.stream = null; }
    }
    if (!this.on) return this.stopMic(); // left while asking
    this.applyLive();
    this.send('vc', { on: true });
    // only now may lines be made: the room passes a handshake along only
    // between two it knows have voice on
    this.ready = true;
    this.onChange();
  }

  /** Out of the room: every line closed, the microphone off. */
  stop() {
    this.inRoom = false;
    this.ready = false;
    for (const k of [...this.peers.keys()]) this.drop(k);
    if (this.on) this.send('vc', { on: false });
    this.on = false;
    this.stopMic();
    this.onChange();
  }
  stopMic() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.micAn = null; }

  /** Push to talk: down and up. */
  talk(on) { if (this.mode === 'ptt' && this.held !== on) this.held = on, this.applyLive(), this.onChange(); }
  /** Open mic: mute and unmute. */
  toggleSelfMute() { if (this.mode === 'open') this.selfMute = !this.selfMute, this.applyLive(), this.onChange(); }
  applyLive() { const on = this.live; this.stream?.getAudioTracks().forEach((t) => (t.enabled = on)); }

  toggleMute(key) { this.muted.has(key) ? this.muted.delete(key) : this.muted.add(key); this.onChange(); }

  // ---- the lines --------------------------------------------------------

  async iceServers() {
    this.iceP ||= this.ice().then((r) => r.iceServers).catch(() => [{ urls: 'stun:stun.l.google.com:19302' }]);
    return this.iceP;
  }

  async line(key) {
    let P = this.peers.get(key);
    if (P) return P;
    const iceServers = await this.iceServers();
    // voice went off while asking: no line
    if (!this.on) return null;
    if (this.peers.has(key)) return this.peers.get(key); // made twice while waiting
    P = { pc: new RTCPeerConnection({ iceServers }), buf: [], talking: false, level: 0 };
    this.peers.set(key, P);
    const pc = P.pc;
    pc.onicecandidate = (e) => e.candidate && this.send('rtc', { to: key, d: { ice: e.candidate.toJSON() } });
    pc.ontrack = (e) => this.hear(key, P, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(key, true);
    };
    return P;
  }

  /** I am the one who calls (the lower key does): an offer, my voice in it if I send. */
  async call(key) {
    const P = await this.line(key);
    if (!P) return;
    const pc = P.pc;
    if (pc.signalingState !== 'stable' || P.called) return;
    P.called = true;
    const track = this.stream?.getAudioTracks()[0];
    if (track) pc.addTrack(track, this.stream); else pc.addTransceiver('audio', { direction: 'recvonly' });
    await pc.setLocalDescription(await pc.createOffer());
    this.send('rtc', { to: key, d: { sdp: pc.localDescription.toJSON() } });
  }

  /** The handshake, from the other side. */
  async signal(from, d) {
    if (!this.on || !d) return;
    try {
      if (d.sdp?.type === 'offer') {
        const P = await this.line(from);
        if (!P) return;
        const pc = P.pc;
        await pc.setRemoteDescription(d.sdp);
        const track = this.stream?.getAudioTracks()[0];
        // my voice back on the line the offer opened
        if (track) pc.addTrack(track, this.stream);
        else pc.getTransceivers().forEach((t) => (t.direction = 'recvonly'));
        await pc.setLocalDescription(await pc.createAnswer());
        this.send('rtc', { to: from, d: { sdp: pc.localDescription.toJSON() } });
        for (const c of P.buf.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (d.sdp?.type === 'answer') {
        const P = this.peers.get(from);
        if (!P || P.pc.signalingState !== 'have-local-offer') return;
        await P.pc.setRemoteDescription(d.sdp);
        for (const c of P.buf.splice(0)) await P.pc.addIceCandidate(c).catch(() => {});
      } else if (d.ice) {
        const P = this.peers.get(from);
        if (!P) return;
        if (P.pc.remoteDescription) await P.pc.addIceCandidate(d.ice).catch(() => {});
        else P.buf.push(d.ice);
      }
    } catch { this.drop(from, true); }
  }

  /** A voice arrives: through a gain (distance) and a panner (direction). */
  hear(key, P, stream) {
    if (P.gain || !this.ctx) return;
    // (a remote stream only flows into Web Audio once a media element plays
    // it; the element itself stays silent)
    P.el = new Audio(); P.el.muted = true; P.el.srcObject = stream; P.el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    P.an = this.ctx.createAnalyser(); P.an.fftSize = 256; P.abuf = new Float32Array(P.an.fftSize);
    P.gain = this.ctx.createGain(); P.gain.gain.value = 0;
    P.pan = this.ctx.createPanner();
    P.pan.panningModel = 'equalpower'; P.pan.distanceModel = 'inverse'; P.pan.refDistance = 1e5; P.pan.rolloffFactor = 0;
    // (the meter sits in the line, not off to the side: a branch that leads
    // nowhere is not played, and would read silence)
    src.connect(P.an); P.an.connect(P.gain); P.gain.connect(P.pan); P.pan.connect(this.ctx.destination);
  }

  drop(key, retry = false) {
    const P = this.peers.get(key);
    if (!P) return;
    this.peers.delete(key);
    try { P.pc.close(); } catch {}
    try { P.gain?.disconnect(); P.pan?.disconnect(); } catch {}
    if (P.el) P.el.srcObject = null;
    // a line that failed is tried again in a while
    if (retry) this.retry.set(key, performance.now() + 5000);
  }

  // ---- every frame ----------------------------------------------------------

  /**
   * Lines to whoever has voice on (and off to whoever turned it off or left),
   * each voice's volume by its distance, and who is talking.
   * `me` {x,y,z}, `others` Map key -> {x,y,z,alive}, `roster` Map key -> {v,bot},
   * `fwd` the way the camera looks (for which way is left).
   */
  update(me, others, roster, fwd) {
    if (!this.on || !this.ready) return;
    const now = performance.now();
    // a line that never came up (a handshake lost on the way) is let go and tried again
    for (const [k, P] of this.peers) {
      P.born ||= now;
      if (P.pc.connectionState !== 'connected' && now - P.born > 20000) this.drop(k, true);
    }
    for (const [k, r] of roster) {
      if (k === this.myKey || r.bot || !r.v) continue;
      if (!this.peers.has(k) && this.myKey < k && (this.retry.get(k) || 0) < now) this.call(k).catch(() => this.drop(k, true));
    }
    for (const k of [...this.peers.keys()]) if (!roster.get(k)?.v) this.drop(k);
    if (!this.ctx) return;
    const t = this.ctx.currentTime, L = this.ctx.listener;
    if (fwd) {
      if (L.forwardX) { L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else L.setOrientation?.(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    for (const [k, P] of this.peers) {
      if (!P.gain) continue;
      const o = others.get(k);
      const d = me && o && o.alive !== false ? Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z) : Infinity;
      const g = this.muted.has(k) ? 0 : voiceGain(d);
      P.gain.gain.setTargetAtTime(g, t, VOICE.glide);
      P.audible = g > 0.02;
      if (o && me) {
        const px = P.pan;
        if (px.positionX) { px.positionX.value = o.x - me.x; px.positionY.value = o.y - me.y; px.positionZ.value = o.z - me.z; }
        else px.setPosition?.(o.x - me.x, o.y - me.y, o.z - me.z);
      }
      // talking: a voice above a whisper, heard
      P.an.getFloatTimeDomainData(P.abuf);
      let sum = 0; for (const v of P.abuf) sum += v * v;
      P.level = Math.sqrt(sum / P.abuf.length);
      P.peak = Math.max(P.peak || 0, P.level);
      P.talking = P.audible && P.level > 0.015;
    }
    if (this.micAn && this.live) {
      this.micAn.getFloatTimeDomainData(this.micBuf);
      let sum = 0; for (const v of this.micBuf) sum += v * v;
      this.micLevel = Math.sqrt(sum / this.micBuf.length);
    } else this.micLevel = 0;
  }

  /** Is this pilot talking, and can I hear them? */
  talking(key) { return !!this.peers.get(key)?.talking; }
  connected(key) { const s = this.peers.get(key)?.pc.connectionState; return s === 'connected'; }
}
