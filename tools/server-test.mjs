// The server for real: accounts over HTTP, then two pilots in one sky — one
// hunts the other down, gets paid, and the pay is still there after a login
// from scratch. `npm run test:server`
import { spawn } from 'node:child_process';
import { Client } from 'colyseus.js';
import { forward } from '../src/shared/flight.js';

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
  for (const type of ['welcome', 'spawn', 'fix', 'hit', 'hurt', 'down', 'reward', 'roster', 'fired', 'incoming', 'boom', 'pong', 'ram', 'flare', 'flared', 'score', 'bt', 'bossStart', 'bossDown', 'bossGone', 'friendIn']) {
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
    ok('welcome: a key and the plane\'s numbers', await until(() => !!solo.key && got(solo, 'welcome')[0]?.m.stats?.hp === 100));
    ok('in the air at a spawn point', await until(() => solo.pose && solo.pose.y > 100));
    ok('bots fill an empty sky', await until(() => solo.snap?.p?.length >= 6, 4000), solo.snap?.p?.length);
    ok('the roster marks them as bots', await until(() => got(solo, 'roster').at(-1)?.m.filter((r) => r.bot).length >= 5));
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
  ok('b goes down to a\'s guns', await until(() => got(b, 'down').some((e) => e.m.v === b.key && e.m.k === a.key && e.m.how === 'guns'), 8000));
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
  const crash = got(b, 'down').at(-1)?.m;
  ok('flying into the sea is a crash', crash?.v === b.key && crash?.how === 'crash', { crash, downs: got(b, 'down').map((e) => e.m), hurt: got(b, 'hurt').slice(-3).map((e) => e.m), spawns: got(b, 'spawn').map((e) => e.m) });

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
