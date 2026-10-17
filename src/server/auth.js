// Accounts and bearer tokens. No dependencies beyond node:crypto.
import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || '';
if (!SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_SECRET must be set in production');
}
const KEY = SECRET || crypto.randomBytes(32).toString('hex'); // dev-only fallback
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const b64 = (b) => Buffer.from(b).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url');

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  const got = crypto.scryptSync(String(password), salt, 64);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export function signToken(userId, extra = {}) {
  const body = b64(JSON.stringify({ sub: userId, exp: Date.now() + TTL_MS, ...extra }));
  const sig = b64(crypto.createHmac('sha256', KEY).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  let expected;
  try { expected = crypto.createHmac('sha256', KEY).update(body).digest(); } catch { return null; }
  const given = unb64(sig || '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(unb64(body).toString('utf8'));
    if (!claims.sub || claims.exp < Date.now()) return null;
    return claims;
  } catch { return null; }
}

export const USERNAME_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export function validateUsername(name) {
  const v = String(name ?? '').trim().toLowerCase();
  if (v.length < 3 || v.length > 16) return { ok: false, reason: 'invalid_username' };
  if (!USERNAME_RE.test(v)) return { ok: false, reason: 'invalid_username' };
  return { ok: true, value: v };
}
