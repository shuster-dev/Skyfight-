// A pilot that plays: joins the arena the way a phone does, flies with the
// same flight model, hunts, shoots, fires missiles, dies and comes back —
// and reports how a few minutes went. The question it answers is the one a
// test cannot: is it fun? (a kill every minute or so, not every ten; levels
// in minutes, not hours; dying sometimes, not all the time.)
//
//   node tools/pilot-bot.mjs [minutes=3] [server=http://127.0.0.1:2567]
// With no server it starts one of its own.
import { spawn } from 'node:child_process';
import { Client } from 'colyseus.js';
import { fly, forward, newBody } from '../src/shared/flight.js';
import { GUN, MISSILE, aimDir, offNose } from '../src/shared/combat.js';
import { groundAt, ARENA } from '../src/shared/arena.js';
import { xpStep } from '../src/shared/planes.js';

const MIN = Number(process.argv[2] || 3);
let BASE = process.argv[3] || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let srv = null;
if (!BASE) {
  const PORT = 3500 + Math.floor(Math.random() * 300);
  BASE = `http://127.0.0.1:${PORT}`;
  srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
  await wait(3000);
}
const api = async (path, body, token) => (await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();

const g = await api('/api/guest', {});
await api('/api/pilot/name', { name: 'BotPilot' }, g.token);
const room = await new Client(BASE.replace('http', 'ws')).joinOrCreate('arena', { token: g.token });
const st = { by: {}, kills: 0, assists: 0, deaths: 0, crashes: 0, shots: 0, hits: 0, missiles: 0, xp: 0, gold: 0, level: 1, firstKillAt: 0, levels: [] };
let me = null, stats = null, key = '', others = new Map(), alive = false, ammo = 1;
const t0 = Date.now();
room.onMessage('welcome', (m) => { key = m.key; stats = m.stats; });
room.onMessage('spawn', (m) => { me = newBody(m, stats); alive = true; ammo = m.ammo; });
room.onMessage('fix', (m) => me && Object.assign(me, m));
let boss = null;
// how the bots fly, seen from here: a bot that has turned a full circle in
// the last six seconds is going round in circles, not fighting
const turns = new Map(), circ = { samples: 0, circling: 0 };
room.onMessage('s', (s) => {
  const now = Date.now();
  boss = s.b ? { key: 'boss', x: s.b[0] / 10, y: s.b[1] / 10, z: s.b[2] / 10, alive: true, vel: { x: 0, y: 0, z: 0 } } : null;
  for (const [k, x, y, z, yaw, pitch, , hp, flags, spd] of s.p) {
    if (k === key) continue;
    const f = forward(yaw / 1000, pitch / 1000);
    const o = others.get(k);
    if (o && o.alive && flags & 1) {
      const h = turns.get(k) || [];
      h.push([now, Math.abs(Math.atan2(Math.sin(yaw / 1000 - o.yaw), Math.cos(yaw / 1000 - o.yaw)))]);
      while (h.length && now - h[0][0] > 6000) h.shift();
      turns.set(k, h);
      if (now - h[0][0] > 5000) { circ.samples++; if (h.reduce((a, x) => a + x[1], 0) > Math.PI * 2 * 0.9) circ.circling++; }
    } else turns.delete(k);
    others.set(k, { key: k, x: x / 10, y: y / 10, z: z / 10, yaw: yaw / 1000, pitch: pitch / 1000, hp, alive: !!(flags & 1), shield: !!(flags & 8), vel: { x: f.x * spd / 10, y: f.y * spd / 10, z: f.z * spd / 10 } });
  }
});
room.onMessage('hit', (m) => { st.hits++; if (m?.how === 'missile') st.mHits = (st.mHits || 0) + 1; });
let rams = 0, rammed = 0, bossSeen = 0, bossDown = 0, bossPay = 0;
room.onMessage('bossStart', () => bossSeen++);
room.onMessage('bossDown', () => bossDown++);
room.onMessage('bossGone', () => {});
room.onMessage('bt', () => {});
room.onMessage('score', () => {});
room.onMessage('ram', (m) => { rams++; if (m.a === key || m.b === key) rammed++; });
room.onMessage('fired', (m) => { st.missiles++; ammo = m.ammo; });
const room_ = { downs: 0, by: {} };
room.onMessage('down', (m) => {
  room_.downs++; room_.by[m.how] = (room_.by[m.how] || 0) + 1;
  if (m.v === key) { alive = false; st.deaths++; st.by[m.how] = (st.by[m.how] || 0) + 1; if (m.how === 'crash' && !m.k) st.crashes++; }
});
room.onMessage('reward', (m) => {
  if (m.boss) { bossPay += m.gold; st.xp = m.pilot.xp; st.gold = m.pilot.gold; return; }
  if (m.assist) st.assists++; else { st.kills++; st.firstKillAt ||= (Date.now() - t0) / 1000; }
  st.xp = m.pilot.xp; st.gold = m.pilot.gold;
  if (m.pilot.level > st.level) st.levels.push(`${m.pilot.level}@${Math.round((Date.now() - t0) / 1000)}s`);
  st.level = m.pilot.level;
});
for (const t of ['roster', 'hurt', 'incoming', 'boom', 'pong', 'flare', 'flared', 'dodged', 'missed', 'pad', 'healed', 'friendIn']) room.onMessage(t, () => {});
room.send('hello');

// the stick, worked out the way a decent player would
let target = null, think = 0, sendT = 0;
const dt = 1 / 30;
const end = t0 + MIN * 60000;
while (Date.now() < end) {
  await wait(1000 / 30);
  if (!alive || !me) continue;
  think -= dt;
  if (think <= 0 || !target || (target === 'boss' ? !boss : !others.get(target)?.alive)) {
    think = 2;
    let best = null, bd = Infinity;
    for (const o of others.values()) {
      if (!o.alive || o.shield) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z);
      if (d < bd) bd = d, best = o.key;
    }
    target = best;
    // a pilot who sees the bomber goes for it, more often than not
    if (boss && Math.random() < 0.6) target = 'boss';
  }
  const t = target === 'boss' ? boss : others.get(target);
  const input = { turn: 0, climb: 0, boost: false };
  let fire = false;
  if (t) {
    const d = aimDir(me, t);
    const wantYaw = Math.atan2(-d.x, -d.z), wantPitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    const dy = Math.atan2(Math.sin(wantYaw - me.yaw), Math.cos(wantYaw - me.yaw));
    input.turn = Math.max(-1, Math.min(1, -dy * 2.5));
    input.climb = Math.max(-1, Math.min(1, (wantPitch - me.pitch) * 2.5));
    const dist = Math.hypot(t.x - me.x, t.y - me.y, t.z - me.z);
    input.boost = dist > 400 && me.fuel > 0.4;
    fire = dist < (stats.gunRange || 450) && offNose(me, me.yaw, me.pitch, t) < 0.12;
    // a pilot breaks off rather than fly into it
    if (dist < 50) input.turn = 1, input.climb = 0.6, fire = false;
    if (ammo > 0 && dist < 600 && offNose(me, me.yaw, me.pitch, t) < MISSILE.lockCone * 0.6) { room.send('missile'); ammo = 0; }
  }
  const f = forward(me.yaw, me.pitch), look = Math.max(60, me.speed * 2.5);
  if (me.y + f.y * look < groundAt(me.x + f.x * look, me.z + f.z * look) + 40 || me.y < groundAt(me.x, me.z) + 45) input.climb = 1, fire = false;
  if (me.y > ARENA.ceiling - 30) input.climb = Math.min(input.climb, -0.4);
  const r = fly(me, input, stats, dt);
  if (r === 'crash') me.y = groundAt(me.x, me.z) + 0.3;
  if (fire) st.shots++;
  sendT += dt;
  if (sendT >= 0.05 || r === 'crash') {
    sendT = 0;
    room.send('pose', [me.x, me.y, me.z, me.yaw, me.pitch, me.roll, me.speed, (fire ? 1 : 0) | (me.boosting ? 2 : 0)]);
  }
}
await room.leave();
const mins = (Date.now() - t0) / 60000;
const report = {
  minutes: +mins.toFixed(1), kills: st.kills, assists: st.assists, deaths: st.deaths, deathsBy: st.by, crashes: st.crashes,
  killsPerMin: +(st.kills / mins).toFixed(2), deathsPerMin: +(st.deaths / mins).toFixed(2),
  firstKillSec: st.firstKillAt ? Math.round(st.firstKillAt) : null,
  hits: st.hits, missiles: st.missiles, missileHits: st.mHits || 0, rams, rammed, bossSeen, bossDown, bossPay, level: st.level, levels: st.levels, xp: st.xp, gold: st.gold, xpToLevel2: xpStep(1),
  arena: { downsPerMin: +(room_.downs / mins).toFixed(2), by: room_.by, circling: circ.samples ? +(circ.circling / circ.samples).toFixed(2) : null },
};
console.log(JSON.stringify(report, null, 1));
srv?.kill();
process.exit(0);
