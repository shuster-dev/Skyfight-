// The server for real: accounts over HTTP, then two pilots in one sky — one
// hunts the other down, gets paid, and the pay is still there after a login
// from scratch. `npm run test:server`
import { spawn } from 'node:child_process';
import { Client } from 'colyseus.js';
import { forward } from '../src/shared/flight.js';
import { ARENA, BUILDINGS, HEAL, HEALS } from '../src/shared/arena.js';

const PORT = 2700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 400)); }
};

const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stdout.on('data', (d) => (log += d));
srv.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 100 && !log.includes('listening'); i++) await wait(100);

const api = async (path, body, token) => {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

/** A pilot at the controls: keeps the latest of everything the room says. */
async function pilot(token, room = 'arena') {
  const c = new Client(`ws://127.0.0.1:${PORT}`);
  const r = await c.joinOrCreate(room, { token });
  const s = { room: r, events: [], snap: null };
  for (const type of ['welcome', 'spawn', 'fix', 'hit', 'hurt', 'down', 'reward', 'roster', 'fired', 'incoming', 'boom', 'pong', 'ram', 'flare', 'flared', 'score', 'bt', 'bossStart', 'bossDown', 'bossGone', 'friendIn', 'healed', 'pad', 'dodged', 'missed', 'royal']) {
    r.onMessage(type, (m) => { s.events.push({ type, m }); type === 'spawn' && (s.pose = { ...m }); type === 'welcome' && (s.key = m.key); });
  }
  r.onMessage('s', (m) => (s.snap = m));
  r.onLeave((code) => (s.left = code));
  r.send('hello');
  return s;
}
const got = (s, type) => s.events.filter((e) => e.type === type);
const until = async (fn, ms = 5000) => { for (let t = 0; t < ms; t += 50) { if (fn()) return true; await wait(50); } return false; };
const send = (s, flags = 0) => s.room.send('pose', [s.pose.x, s.pose.y, s.pose.z, s.pose.yaw, s.pose.pitch || 0, 0, 60, flags]);

try {
  console.log('\naccounts');
  ok('health', (await api('/api/health')).ok === true);
  const g = await api('/api/guest', {});
  ok('a guest is made with a token and a fresh pilot', g.token && g.guest && g.pilot.level === 1 && g.pilot.plane === 'sparrow', g);
  ok('without a name the arena says no', await (async () => { try { await pilot(g.token); return false; } catch { return true; } })());
  ok('a bad callsign is refused', (await api('/api/pilot/name', { name: '<x>' }, g.token)).error === 'bad_name');
  ok('a callsign is set', (await api('/api/pilot/name', { name: 'צייד' }, g.token)).pilot?.name === 'צייד');
  ok('a plane above the level is refused', (await api('/api/pilot/buy-plane', { plane: 'hornet' }, g.token)).error === 'level');
  ok('no token, no hangar', (await api('/api/me')).status === 401);

  const h = await api('/api/guest', {});
  await api('/api/pilot/name', { name: 'מטרה' }, h.token);

  console.log('\nthe sky with bots');
  {
    const solo = await pilot(g.token);
    ok('welcome: a key and the plane\'s numbers', await until(() => !!solo.key && got(solo, 'welcome')[0]?.m.stats?.hp === 250));
    ok('in the air at a spawn point', await until(() => solo.pose && solo.pose.y > 100));
    ok('bots fill the sky to ten planes', await until(() => solo.snap?.p?.length === 10, 4000), solo.snap?.p?.length);
    ok('the roster marks them as bots: nine, and me', await until(() => got(solo, 'roster').at(-1)?.m.filter((r) => r.bot).length === 9));
    const kinds = got(solo, 'roster').at(-1).m.filter((r) => r.bot);
    ok('the bots fly different things', new Set(kinds.map((r) => `${r.plane}/${r.gun}/${r.level}`)).size > 1, kinds.map((r) => `${r.plane}/${r.gun}/${r.level}`));
    // a second person takes a bot's seat
    const two = await pilot(h.token);
    ok('a second pilot in: still ten, one bot fewer', await until(() => { const r = got(solo, 'roster').at(-1)?.m || []; return r.length === 10 && r.filter((x) => x.bot).length === 8; }, 4000), (got(solo, 'roster').at(-1)?.m || []).map((x) => x.bot));
    await two.room.leave();
    ok('and the bot comes back when they leave', await until(() => (got(solo, 'roster').at(-1)?.m || []).filter((x) => x.bot).length === 9, 4000));
    // a pose no plane could fly is put back
    solo.room.send('pose', [solo.pose.x + 900, solo.pose.y, solo.pose.z, 0, 0, 0, 60, 0]);
    ok('a teleport is corrected', await until(() => got(solo, 'fix').length > 0));
    // the room's word is final: take the corrected pose
    Object.assign(solo.pose, got(solo, 'fix').at(-1).m);
    // the bots fight: in a while someone goes down (solo keeps its screen awake)
    const awake = setInterval(() => solo.pose && send(solo), 100);
    ok('the bots fight (someone goes down)', await until(() => got(solo, 'down').length > 0, 40000));
    clearInterval(awake);
    await solo.room.leave();
  }

  console.log('\na duel');
  const a = await pilot(g.token, 'arena_duel');
  const b = await pilot(h.token, 'arena_duel');
  ok('both in the same sky', await until(() => a.snap?.p?.length === 2 && b.snap?.p?.length === 2));
  ok('no bots in the duel room', a.snap.p.length === 2);
  // b holds still; a flies up behind it a plausible step at a time
  const hold = setInterval(() => send(b), 50);
  const target = () => b.pose;
  await wait(200);
  // (by way of a point high above, so the path never runs through b:
  // planes collide now)
  const walk = async (goal) => {
    for (let i = 0; i < 400; i++) {
      const [gx, gy, gz] = goal();
      const dx = gx - a.pose.x, dy = gy - a.pose.y, dz = gz - a.pose.z, d = Math.hypot(dx, dy, dz);
      if (d < 1) return;
      const k = Math.min(1, 14 / d);
      a.pose.x += dx * k; a.pose.y += dy * k; a.pose.z += dz * k;
      send(a);
      await wait(50);
    }
  };
  const behind = (up) => () => { const t = target(), f = forward(t.yaw, 0); return [t.x - f.x * 60, t.y + up, t.z - f.z * 60]; };
  await walk(() => [a.pose.x, target().y + 80, a.pose.z]);
  await walk(behind(80));
  await walk(behind(0));
  // nose on b
  a.pose.yaw = b.pose.yaw; a.pose.pitch = 0;
  send(a);
  ok('a flew up behind b without a correction', got(a, 'fix').length === 0, got(a, 'fix'));
  // b's spawn shield runs out, then a opens fire
  await wait(2500);
  const fire = setInterval(() => send(a, 1), 50);
  ok('rounds hit: a sees hits, b feels them', await until(() => got(a, 'hit').length > 3 && got(b, 'hurt').length > 3, 6000), { hits: got(a, 'hit').length });
  ok('b goes down to a\'s guns', await until(() => got(b, 'down').some((e) => e.m.v === b.key && e.m.k === a.key && e.m.how === 'guns'), 25000));
  clearInterval(fire);
  send(a, 0);
  const hitsAtStop = got(a, 'hit').length;
  const pay = got(a, 'reward')[0]?.m;
  ok('a is paid xp and gold for it', pay && pay.xp > 0 && pay.gold > 0 && pay.pilot.kills === 1, pay);
  ok('b comes back after the delay', await until(() => got(b, 'spawn').length >= 2, 5000));
  const meA = await api('/api/me', null, g.token);
  ok('the pay is in the record', meA.pilot.kills === 1 && meA.pilot.xp === pay.xp && meA.pilot.gold === pay.gold, meA.pilot);
  ok('b\'s record counts the death', (await api('/api/me', null, h.token)).pilot.deaths === 1);

  ok('no more hits once a stops firing', got(a, 'hit').length - hitsAtStop <= 2, got(a, 'hit').slice(hitsAtStop).map((e) => e.m));
  console.log('\na collision');
  // a and b fly into each other head-on: a flies its last few metres onto b
  await wait(3200); // b's shield from the respawn
  const r0 = got(a, 'down').length;
  {
    const t = b.pose;
    for (let i = 0; i < 250 && got(a, 'down').length === r0; i++) {
      const dx = t.x - a.pose.x, dy = t.y - a.pose.y, dz = t.z - a.pose.z, d = Math.hypot(dx, dy, dz);
      const k = Math.min(1, 15 / Math.max(d, 1e-6));
      a.pose.x += dx * k; a.pose.y += dy * k; a.pose.z += dz * k;
      send(a);
      await wait(50);
    }
  }
  const ram = got(a, 'down').slice(r0).find((e) => e.m.how === 'collision') || got(a, 'hurt').find((e) => e.m.how === 'collision');
  ok('flying into another plane is a collision', !!ram && (got(a, 'ram').length > 0), { ram: ram?.m, rams: got(a, 'ram').length });
  await wait(3300); // whoever went down comes back

  console.log('\nmissiles');
  a.room.send('missile');
  ok('a missile is fired', await until(() => got(a, 'fired').length > 0));
  ok('the room says what it locked (or nothing)', typeof got(a, 'fired')[0]?.m.target === 'string');

  console.log('\na crash');
  clearInterval(hold);
  const before = got(b, 'down').length;
  for (let i = 0; i < 80 && got(b, 'down').length === before; i++) {
    b.pose.y = Math.max(0.5, b.pose.y - 14);
    send(b);
    await wait(50);
  }
  const crash = got(b, 'down').at(-1)?.m, spawnsAtCrash = got(b, 'spawn').length;
  ok('flying into the sea is a crash', crash?.v === b.key && crash?.how === 'crash', { crash, downs: got(b, 'down').map((e) => e.m), hurt: got(b, 'hurt').slice(-3).map((e) => e.m), spawns: got(b, 'spawn').map((e) => e.m) });

  console.log('\na roof');
  {
    // back in the air, then flown (at a speed the room believes) onto the
    // roof of the tallest tower, stopping a metre above it, as a client does
    await until(() => got(b, 'spawn').length > spawnsAtCrash, 9000);
    await wait(500);
    const t = BUILDINGS.reduce((a, o) => (o.h > a.h ? o : a)), top = t.base + t.h;
    const downs = got(b, 'down').length;
    b.room.send('crash');
    await wait(300);
    ok('a plane in open air that says it crashed does not', got(b, 'down').length === downs);
    for (let i = 0; i < 600; i++) {
      const dx = t.x - b.pose.x, dy = top + 1.2 - b.pose.y, dz = t.z - b.pose.z, d = Math.hypot(dx, dy, dz);
      if (d < 0.5) break;
      const k = Math.min(1, 3.5 / d);
      b.pose.x += dx * k; b.pose.y += dy * k; b.pose.z += dz * k;
      b.pose.yaw = Math.atan2(-dx, -dz);
      send(b);
      await wait(50);
    }
    for (let i = 0; i < 10 && got(b, 'down').length === downs; i++) { send(b); b.room.send('crash'); await wait(100); }
    const roof = got(b, 'down').at(-1)?.m;
    ok('stopped on a roof: a crash, not stuck there', got(b, 'down').length > downs && roof?.how === 'crash' && roof?.v === b.key, { roof, at: [b.pose.x, b.pose.y, b.pose.z], top });
  }

  console.log('\nsaving');
  ok('guests are not on the board', ((await api('/api/leaderboard')).rows || []).length === 0);
  const saved = await api('/api/register', { username: 'hunter1', password: 'pass1' }, g.token);
  ok('a guest saves with a username and keeps the pilot', saved.pilot?.kills === 1);
  ok('a saved pilot gets a number for the name', saved.pilot?.tag === 1, saved.pilot);
  ok('the name is taken now', (await api('/api/register', { username: 'hunter1', password: 'xxxx' })).status === 409);
  ok('a wrong password is refused', (await api('/api/login', { username: 'hunter1', password: 'nope' })).status === 401);
  const back = await api('/api/login', { username: 'hunter1', password: 'pass1' });
  ok('a login from scratch finds the same pilot', back.pilot?.name === 'צייד' && back.pilot.kills === 1 && back.pilot.xp === pay.xp, back);
  const lb = await api('/api/leaderboard?kind=kills');
  ok('the leaderboard has them, by name and number', lb.rows?.[0]?.name === 'צייד#1' && lb.rows.length === 1, lb);
  // a second צייד: the next number, and both on the board
  const g2 = await api('/api/guest', {});
  await api('/api/pilot/name', { name: 'צייד' }, g2.token);
  const twin = await api('/api/register', { username: 'hunter2', password: 'pass2' }, g2.token);
  ok('the same name saved again is #2', twin.pilot?.tag === 2, twin.pilot);
  const lb2 = await api('/api/leaderboard');
  ok('two pilots of one name are told apart', ['צייד#1', 'צייד#2'].every((n) => lb2.rows.some((r) => r.name === n)), lb2.rows);
  const renamed = await api('/api/pilot/name', { name: 'נשר' }, twin.token);
  ok('a new name gets its own number', renamed.pilot?.name === 'נשר' && renamed.pilot.tag === 1, renamed.pilot);

  console.log('\nthe admin');
  {
    // מאיר#1 is the admin (ADMIN_CODES unset): a saved pilot of that name and number
    const a = await api('/api/guest', {});
    await api('/api/pilot/name', { name: 'מאיר' }, a.token);
    const adm = await api('/api/register', { username: 'meiradmin', password: 'pass9' }, a.token);
    ok('מאיר#1, saved, is the admin', adm.admin === true && adm.pilot.tag === 1, { admin: adm.admin, tag: adm.pilot?.tag });
    ok('anyone else is not', (await api('/api/me', null, back.token)).admin === false && (await api('/api/admin/pilots', null, back.token)).status === 403);
    ok('nor can they give gold', (await api('/api/admin/edit', { code: 'צייד#1', gold: 999999 }, back.token)).status === 403);
    const who = await api('/api/admin/pilot?code=' + encodeURIComponent('צייד#1'), null, adm.token);
    ok('the admin looks a pilot up by code', who.pilot?.code === 'צייד#1', who);
    ok('and lists the pilots', (await api('/api/admin/pilots', null, adm.token)).rows?.some((r) => r.code === 'צייד#1'));
    const g1 = await api('/api/admin/edit', { code: 'צייד#1', gold: 50000 }, adm.token);
    ok('sets gold', g1.pilot?.gold === 50000 && (await api('/api/me', null, back.token)).pilot.gold === 50000, g1);
    ok('adds gold, never below nothing', (await api('/api/admin/edit', { code: 'צייד#1', addGold: 2500 }, adm.token)).pilot?.gold === 52500 && (await api('/api/admin/edit', { code: 'צייד#1', addGold: -1e9 }, adm.token)).pilot?.gold === 0);
    ok('gives a plane, whatever the level', (await api('/api/admin/edit', { code: 'צייד#1', plane: 'phantom' }, adm.token)).pilot?.planes.includes('phantom') && (await api('/api/pilot/plane', { plane: 'phantom' }, back.token)).pilot?.plane === 'phantom');
    ok('or all of them, the gift planes too', (await api('/api/admin/edit', { code: 'צייד#1', plane: 'all' }, adm.token)).pilot?.planes.length === 12);
    ok('sets the level', (await api('/api/admin/edit', { code: 'צייד#1', level: 12 }, adm.token)).pilot?.level === 12);
    ok('nonsense is refused', (await api('/api/admin/edit', { code: 'צייד#1', plane: '__proto__' }, adm.token)).error === 'no_such_plane' && (await api('/api/admin/edit', { code: 'צייד#1', level: 99 }, adm.token)).error === 'bad_level' && (await api('/api/admin/edit', { code: 'nobody#9', gold: 1 }, adm.token)).status === 404);
    await api('/api/admin/edit', { code: 'צייד#1', level: 1, plane: 'sparrow' }, adm.token);
    await api('/api/pilot/plane', { plane: 'sparrow' }, back.token);
  }

  console.log('\na gift code');
  {
    const k = await api('/api/guest', {});
    await api('/api/pilot/name', { name: 'מלך' }, k.token);
    const r = await api('/api/pilot/gift', { code: 'alfasi' }, k.token);
    ok('ALFASI gives the helicopter, and it is flown', r.pilot?.planes.includes('alfasi') && r.pilot.plane === 'alfasi' && r.gift?.plane === 'alfasi', r);
    ok('once', (await api('/api/pilot/gift', { code: 'ALFASI' }, k.token)).error === 'gift_used');
    ok('a wrong code is refused', (await api('/api/pilot/gift', { code: 'XYZ' }, k.token)).error === 'no_such_gift');
    ok('it cannot be bought', (await api('/api/pilot/buy-plane', { plane: 'alfasi' }, back.token)).error === 'gift_only');
    // into the sky with it: everyone there is told the king has come
    const watcher = await pilot(back.token, 'arena_gift_test');
    const king = await pilot(k.token, 'arena_gift_test');
    await until(() => got(watcher, 'royal').length && got(king, 'welcome').length, 4000);
    const said = got(watcher, 'royal')[0]?.m, st = got(king, 'welcome')[0]?.m.stats;
    ok('the king joins: the whole sky is told', said?.text === 'אלפסי המלך הצטרף לקרב', said);
    ok('and his guns reach a kilometre', st?.gunRange === 1000 && st?.mRange === 5000, st);
    await king.room.leave(); await watcher.room.leave();
  }
  {
    // SHUSTER: the strongest, its banner, a missile every half second at most
    const s2 = await api('/api/guest', {});
    await api('/api/pilot/name', { name: 'שוסטר' }, s2.token);
    ok('SHUSTER gives the fighter', (await api('/api/pilot/gift', { code: 'SHUSTER' }, s2.token)).pilot?.plane === 'shuster');
    const n = await api('/api/pilot/gift', { code: 'neon' }, s2.token);
    ok('NEON lights the plane flown', n.pilot?.neon === true && n.pilot.neonOf?.shuster === true);
    const watcher = await pilot(back.token, 'arena_gift_test');
    const ace = await pilot(s2.token, 'arena_gift_test');
    await until(() => got(watcher, 'royal').length && got(ace, 'spawn').length, 4000);
    ok('it takes off: the sky is told שוסטר הצטרף לקרב', got(watcher, 'royal').some((e) => e.m.text === 'שוסטר הצטרף לקרב'));
    const st = got(ace, 'welcome')[0]?.m.stats;
    ok('its guns reach 2 km and its missiles 5 km', st?.gunRange === 2000 && st?.mRange === 5000, st);
    const glow = () => [...got(watcher, 'roster').map((e) => e.m), ...got(watcher, 'welcome').map((e) => e.m.roster)].some((l) => l?.some((r) => r.plane === 'shuster' && r.neon));
    ok('the others see it glowing', await until(glow, 3000));
    await wait(4500); // past the shield, so the rack is armed
    ace.room.send('missile'); ace.room.send('missile'); ace.room.send('missile');
    await wait(250);
    const first = got(ace, 'fired').length;
    await wait(600);
    ace.room.send('missile');
    await wait(250);
    ok('three at once: one goes; half a second later, the next', first === 1 && got(ace, 'fired').length === 2, { first, then: got(ace, 'fired').length });
    await ace.room.leave(); await watcher.room.leave();
  }

  console.log('\na phone\'s network');
  {
    const n1 = await pilot(back.token, 'arena_duel');
    await until(() => got(n1, 'spawn').length, 4000);
    await wait(300);
    // flying at full burner, its poses held back and let go in a bunch: the
    // time between them was flown, so none is put back
    const st = got(n1, 'welcome')[0].m.stats, f = forward(n1.pose.yaw, 0);
    const fixes = got(n1, 'fix').length;
    for (let burst = 0; burst < 6; burst++) {
      await wait(300);
      for (let i = 0; i < 6; i++) {
        n1.pose.x += f.x * st.boost * 0.05; n1.pose.z += f.z * st.boost * 0.05;
        n1.room.send('pose', [n1.pose.x, n1.pose.y, n1.pose.z, n1.pose.yaw, 0, 0, st.boost, 0]);
      }
    }
    await wait(300);
    ok('poses that come in bunches at full burner: none put back', got(n1, 'fix').length === fixes, got(n1, 'fix').length - fixes);
    // a jump no plane could fly still is
    n1.pose.x += 2000;
    send(n1);
    ok('a jump no plane could fly is still put back', await until(() => got(n1, 'fix').length > fixes, 2000));
    // the line drops (no goodbye): the plane waits, and the pilot gets back into it
    const key = n1.key, token = n1.room.reconnectionToken;
    n1.room.connection.close();
    await wait(800);
    const w = await api('/api/guest', {});
    await api('/api/pilot/name', { name: 'צופה' }, w.token);
    const watcher = await pilot(w.token, 'arena_duel');
    await until(() => watcher.snap?.p?.length, 3000);
    ok('a dropped pilot\'s plane waits in the sky', watcher.snap.p.some((r) => r[0] === key));
    const again = await new Client(`ws://127.0.0.1:${PORT}`).reconnect(token);
    let snap = null;
    again.onMessage('s', (m) => (snap = m));
    ['fix', 'spawn', 'hit', 'hurt'].forEach((t) => again.onMessage(t, () => {}));
    ok('back in, the same plane', await until(() => snap?.p?.some((r) => r[0] === key), 3000));
    await again.leave(); await watcher.room.leave();
  }

  console.log('\npaint');
  ok('a paint costs gold', (await api('/api/pilot/buy-paint', { paint: 'gold' }, back.token)).error === 'gold');
  ok('the stock paint is worn', (await api('/api/pilot/paint', { paint: 'stock' }, back.token)).pilot?.paint === 'stock');
  ok('a paint you do not own cannot be worn', (await api('/api/pilot/paint', { paint: 'night' }, back.token)).error === 'not_owned');

  console.log('\nteams, and a friend by link');
  const t1 = await pilot(back.token, 'arena_teams_test');
  ok('the teams room says so, with a side', await until(() => got(t1, 'welcome')[0]?.m.mode === 'teams' && ['b', 'r'].includes(got(t1, 'welcome')[0]?.m.team)));
  const g3 = await api('/api/guest', {});
  await api('/api/pilot/name', { name: 'חבר' }, g3.token);
  // the friend comes in by the room's id, as the invite link carries it
  const roomId = got(t1, 'welcome')[0].m.room;
  const c = new Client(`ws://127.0.0.1:${PORT}`);
  const fr = { room: await c.joinById(roomId, { token: g3.token }), events: [] };
  for (const type of ['welcome', 'spawn', 'roster', 'score', 's', 'down', 'hit', 'hurt']) fr.room.onMessage(type, (m) => fr.events.push({ type, m }));
  fr.room.send('hello');
  ok('the invite link brings the friend into the same room', fr.room.roomId === roomId);
  const w1 = got(t1, 'welcome')[0].m, w2 = await until(() => got(fr, 'welcome')[0]) && got(fr, 'welcome')[0].m;
  ok('the two are put on opposite sides', w1.team && w2.team && w1.team !== w2.team, { a: w1.team, b: w2.team });
  await t1.room.leave(); await fr.room.leave();

  console.log('\nfriends');
  ok('a code must be name#number', (await api('/api/friends/add', { code: 'צייד' }, twin.token)).error === 'bad_code');
  ok('a pilot who is not there is not found', (await api('/api/friends/add', { code: 'אין#77' }, twin.token)).status === 404);
  ok('you are not your own friend', (await api('/api/friends/add', { code: 'נשר#1' }, twin.token)).error === 'self');
  const add = await api('/api/friends/add', { code: 'צייד#1' }, twin.token);
  ok('a friend is added by name and number', add.ok && add.friend?.code === 'צייד#1', add);
  ok('and only once', (await api('/api/friends/add', { code: 'צייד#1' }, twin.token)).error === 'already_friends');
  const mine = await api('/api/friends', null, back.token);
  ok('both ways: the other has them too, and their own code', mine.me === 'צייד#1' && mine.rows?.[0]?.code === 'נשר#1', mine);
  ok('someone in the hangar shows as there', mine.rows?.[0]?.state === 'hangar', mine.rows);
  const fa = await pilot(back.token, 'arena_duel');
  await until(() => fa.key, 3000);
  const seen = await api('/api/friends', null, twin.token);
  const row = seen.rows?.[0];
  ok('a friend in the air shows where', row?.state === 'air' && row.room === got(fa, 'welcome')[0]?.m.room && row.mode === 'ffa', seen.rows);
  const fc = new Client(`ws://127.0.0.1:${PORT}`);
  const fj = await fc.joinById(row.room, { token: twin.token });
  for (const type of ['welcome', 'spawn', 's', 'roster']) fj.onMessage(type, () => {});
  fj.send('hello');
  ok('join puts you in their room', fj.roomId === row.room);
  ok('and they hear that you came', await until(() => got(fa, 'friendIn').some((e) => e.m.name === 'נשר#1'), 3000), got(fa, 'friendIn'));
  await fj.leave(); await fa.room.leave();
  await wait(200);
  ok('landed again: back in the hangar', (await api('/api/friends', null, twin.token)).rows?.[0]?.state === 'hangar');
  ok('a friend can be removed', (await api('/api/friends/remove', { code: 'צייד#1' }, twin.token)).ok && (await api('/api/friends', null, back.token)).rows?.length === 0);

  console.log('\nrepair pads');
  const rp = await pilot(back.token, 'arena_pad_test');
  await until(() => rp.pose, 3000);
  ok('it starts hurt (the test room)', got(rp, 'spawn')[0]?.m.hp < 250);
  ok('the pads are told on arrival, all ready', (got(rp, 'welcome')[0]?.m.pads || []).length === HEALS.length && got(rp, 'welcome')[0].m.pads.every((t) => t === 0));
  // over the first pad, high, then straight down through it
  const pad = HEALS[0];
  const go = async (gx, gy, gz) => {
    for (let i = 0; i < 400; i++) {
      const dx = gx - rp.pose.x, dy = gy - rp.pose.y, dz = gz - rp.pose.z, d = Math.hypot(dx, dy, dz);
      if (d < 1 || got(rp, 'healed').length) return;
      const k = Math.min(1, 12 / d);
      rp.pose.x += dx * k; rp.pose.y += dy * k; rp.pose.z += dz * k;
      send(rp);
      await wait(50);
    }
  };
  await go(rp.pose.x, ARENA.ceiling - 30, rp.pose.z);
  await go(pad.x, ARENA.ceiling - 30, pad.z);
  await go(pad.x, pad.y + HEAL.h * 0.5, pad.z);
  await until(() => got(rp, 'healed').length > 0, 1500);
  const healed = got(rp, 'healed')[0]?.m;
  ok('flying low through a pad patches the plane up to full, missiles and flares too', healed && healed.gain > 0 && healed.hp >= 250 && healed.ammo >= 1 && healed.flares >= 2, { healed, fixes: got(rp, 'fix').length });
  ok('and the pad is spent for a while, for everyone', got(rp, 'pad').some((e) => e.m.i === 0 && e.m.s === HEAL.every));
  await rp.room.leave();

  console.log('\nfive against five');
  {
    const tm = await pilot(g2.token, 'arena_teams');
    ok('a teams sky is five a side', await until(() => { const r = got(tm, 'roster').at(-1)?.m || []; return r.length === 10 && r.filter((x) => x.team === 'b').length === 5 && r.filter((x) => x.team === 'r').length === 5; }, 4000), (got(tm, 'roster').at(-1)?.m || []).map((x) => x.team + (x.bot ? '*' : '')));
    await tm.room.leave();
  }

  console.log('\nthe bomber');
  const bz = await pilot(back.token, 'arena_boss_test');
  ok('the bomber comes', await until(() => got(bz, 'bossStart').length > 0 && bz.snap?.b, 5000));
  await until(() => bz.pose, 3000);
  await wait(3200); // the spawn shield
  // fly up behind it and stay there, guns on
  let downed = false;
  for (let i = 0; i < 700 && !downed; i++) {
    const [x, y, z, yaw] = bz.snap.b; const by = yaw / 1000, f = forward(by, 0);
    const gx = x / 10 - f.x * 70, gy = y / 10, gz = z / 10 - f.z * 70;
    const dx = gx - bz.pose.x, dy = gy - bz.pose.y, dz = gz - bz.pose.z, d = Math.hypot(dx, dy, dz);
    const k = Math.min(1, 14 / Math.max(d, 1e-6));
    bz.pose.x += dx * k; bz.pose.y += dy * k; bz.pose.z += dz * k; bz.pose.yaw = by; bz.pose.pitch = 0;
    send(bz, d < 30 ? 1 : 0);
    await wait(50);
    downed = got(bz, 'bossDown').length > 0;
  }
  ok('it can be shot down', downed);
  const prize = got(bz, 'reward').find((e) => e.m.boss)?.m;
  ok('and the one who did it all is paid, with the top prize', prize && prize.top && prize.gold >= 1000 && prize.share === 100, prize);
  ok('its gunners fire back', got(bz, 'bt').length > 0);
  await bz.room.leave();

  console.log('\nanother tab');
  const a2 = await pilot(back.token, 'arena_duel');
  ok('the same pilot joining again closes the older one', await until(() => a.left !== undefined, 3000) && a2.key !== a.key, { left: a.left });
  await a2.room.leave(); await b.room.leave();
} catch (e) {
  fail++;
  console.log('  FAIL (threw)', e.stack || e);
} finally {
  srv.kill('SIGTERM');
  await wait(300);
  if (fail) console.log(log.slice(-2000));
  if (process.env.SERVER_LOG) (await import('node:fs')).writeFileSync(process.env.SERVER_LOG, log);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
