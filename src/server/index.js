// Skyfight's server: the accounts and the hangar over HTTP, the arena over a
// websocket, and the game's own page from dist/web.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import crypto from 'node:crypto';
import { openStore } from './store.js';
import { hashPassword, verifyPassword, signToken, verifyToken, validateUsername } from './auth.js';
import { buyPaint, buyPlane, buyUpgrade, choosePaint, choosePlane, newPilot, normalize, view } from './pilot.js';
import { ArenaRoom } from './rooms/ArenaRoom.js';
import { cleanCallsign } from '../shared/planes.js';

process.on('unhandledRejection', (e) => console.error('[unhandled]', e));

const PORT = Number(process.env.PORT || 2567);
const TESTING = process.env.NODE_ENV === 'test';
export const store = await openStore();

/** A bucket per address: so many requests, refilled at so many a second. */
class Limiter {
  constructor(rate, burst) { this.rate = rate; this.burst = burst; this.map = new Map(); }
  take(key, now = Date.now()) {
    let b = this.map.get(key);
    if (!b) {
      if (this.map.size > 20000) this.map.delete(this.map.keys().next().value);
      this.map.set(key, b = { n: this.burst, at: now });
    }
    b.n = Math.min(this.burst, b.n + (now - b.at) / 1000 * this.rate); b.at = now;
    if (b.n < 1) return false;
    b.n -= 1;
    return true;
  }
  mw() { return (req, res, next) => (this.take(req.ip || '?') ? next() : res.status(429).json({ error: 'too_many_requests' })); }
}
// the doors people guess passwords at, and make accounts by the hundred at
const knock = new Limiter(TESTING ? 1000 : 0.2, TESTING ? 1e6 : 12);
const newcomer = new Limiter(TESTING ? 1000 : 0.05, TESTING ? 1e6 : 8);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

const requireAuth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  const claims = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
  const user = claims && await store.findUser(claims.sub);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
};
const pilotOf = async (id) => {
  let p = await store.getPilot(id);
  if (!p) p = await store.savePilot(newPilot(id));
  return normalize(p);
};
/**
 * A saved pilot's number: given the first time a saved account has a name,
 * and again when the name changes (מאיר#1 who becomes דני is a new דני#n).
 * Guests have none, and are not on the board.
 */
async function tagPilot(user, p) {
  if (user.guest || !p.name || (p.registered && p.tag && p.tagName === p.name)) return p;
  p.registered = true;
  if (!p.tag || p.tagName !== p.name) p.tag = await store.nextTag(p.name), p.tagName = p.name;
  await store.savePilot(p);
  return p;
}
const me = async (user) => ({ guest: !!user.guest, username: user.username || '', pilot: view(await tagPilot(user, await pilotOf(user.id))) });

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- accounts ---------------------------------------------------------------
// No form to start: a guest account is made on the first visit and kept by a
// token on the device. Choosing a username and a password later keeps the
// same pilot — that is "saving".
app.post('/api/guest', newcomer.mw(), async (req, res) => {
  const user = await store.createUser({ id: crypto.randomUUID(), guest: true, created: Date.now() });
  await store.savePilot(newPilot(user.id));
  res.json({ token: signToken(user.id), ...(await me(user)) });
});

app.post('/api/register', knock.mw(), async (req, res) => {
  const v = validateUsername(req.body?.username);
  if (!v.ok) return res.status(400).json({ error: v.reason });
  const pass = String(req.body?.password || '');
  if (pass.length < 4 || pass.length > 64) return res.status(400).json({ error: 'invalid_password' });
  if (await store.findUserByName(v.value)) return res.status(409).json({ error: 'username_taken' });
  // a guest who saves keeps their pilot; anyone else gets a new one
  const h = req.headers.authorization || '';
  const claims = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
  let user = claims && await store.findUser(claims.sub);
  const { salt, hash } = hashPassword(pass);
  if (user?.guest) {
    Object.assign(user, { guest: false, username: v.value, salt, hash });
    await store.saveUser(user);
  } else {
    user = await store.createUser({ id: crypto.randomUUID(), username: v.value, salt, hash, guest: false, created: Date.now() });
    await store.savePilot(newPilot(user.id));
  }
  res.json({ token: signToken(user.id), ...(await me(user)) });
});

app.post('/api/login', knock.mw(), async (req, res) => {
  const v = validateUsername(req.body?.username);
  const user = v.ok && await store.findUserByName(v.value);
  if (!user || !user.hash || !verifyPassword(String(req.body?.password || ''), user.salt, user.hash)) return res.status(401).json({ error: 'bad_login' });
  res.json({ token: signToken(user.id), ...(await me(user)) });
});

app.get('/api/me', requireAuth, async (req, res) => res.json(await me(req.user)));

// --- the hangar -------------------------------------------------------------
const hangar = (fn) => async (req, res) => {
  const p = await pilotOf(req.user.id);
  const r = fn(p, req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  await store.savePilot(p);
  res.json({ ok: true, ...r, pilot: view(p) });
};
app.post('/api/pilot/name', requireAuth, async (req, res) => {
  const name = cleanCallsign(req.body?.name);
  if (!name) return res.status(400).json({ error: 'bad_name' });
  const p = await pilotOf(req.user.id);
  p.name = name;
  await store.savePilot(p);
  await tagPilot(req.user, p);
  res.json({ ok: true, pilot: view(p) });
});
app.post('/api/pilot/plane', requireAuth, hangar((p, b) => choosePlane(p, String(b.plane || ''))));
app.post('/api/pilot/buy-plane', requireAuth, hangar((p, b) => buyPlane(p, String(b.plane || ''))));
app.post('/api/pilot/upgrade', requireAuth, hangar((p, b) => buyUpgrade(p, String(b.upgrade || ''))));
app.post('/api/pilot/buy-paint', requireAuth, hangar((p, b) => buyPaint(p, String(b.paint || ''))));
app.post('/api/pilot/paint', requireAuth, hangar((p, b) => choosePaint(p, String(b.paint || ''))));

app.get('/api/leaderboard', async (req, res) => res.json({ rows: await store.leaderboard(req.query.kind === 'kills' ? 'kills' : 'level', 20) }));

// --- the page ---------------------------------------------------------------
const webRoot = path.resolve('dist/web');
if (fs.existsSync(webRoot)) {
  // the link's preview needs an absolute address for its picture
  const page = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
  const servePage = (req, res) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    res.setHeader('cache-control', 'no-cache');
    res.type('html').send(page.replace(/content="\.\/og\.jpg"/g, `content="${origin}/og.jpg"`).replace('<!--og:url-->', `<meta property="og:url" content="${origin}/">`));
  };
  app.get(['/', '/index.html'], servePage);
  app.use(express.static(webRoot, { maxAge: '1h', index: false }));
}

const httpServer = http.createServer(app);
export const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('arena', ArenaRoom, { store, noBots: process.env.NO_BOTS === '1' });
gameServer.define('arena_teams', ArenaRoom, { store, mode: 'teams', noBots: process.env.NO_BOTS === '1' });
// the tests' own sky, with nobody else in it
if (TESTING) {
  gameServer.define('arena_duel', ArenaRoom, { store, noBots: true, boss: false });
  gameServer.define('arena_teams_test', ArenaRoom, { store, mode: 'teams', noBots: true, boss: false });
  gameServer.define('arena_boss_test', ArenaRoom, { store, noBots: true, bossFirst: 300, bossHp: 60 });
}
await gameServer.listen(PORT);
console.log(`[skyfight] listening on :${PORT} (db=${process.env.DB_DRIVER || 'memory'})`);

const stop = async () => {
  await gameServer.gracefullyShutdown(false).catch(() => {});
  await store.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
