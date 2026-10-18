// The admin's tab on a phone: מאיר#1 (the default admin) looking at another pilot.
//   npm run build && node tools/admin-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/admin';
const PORT = 4600 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(2500);
const api = async (path, body, token) => (await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
// someone to look at, and the admin
const o = await api('/api/guest', {});
await api('/api/pilot/name', { name: 'דני' }, o.token);
await api('/api/register', { username: 'dani1', password: 'pass1' }, o.token);
const a = await api('/api/guest', {});
await api('/api/pilot/name', { name: 'מאיר' }, a.token);
const adm = await api('/api/register', { username: 'meir1', password: 'pass1' }, a.token);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate(([k, t]) => localStorage.setItem(k, t), ['sky.token', adm.token]);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
await page.click('#btn-go');
await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
await page.click('.h-tabs [data-tab="admin"]');
await wait(1500);
await page.fill('#ad-code', 'דני#1');
await page.click('#ad-find button');
await wait(1500);
await page.screenshot({ path: `${OUT}/admin.png` });
console.log('tab shown:', await page.isVisible('.h-tabs [data-tab="admin"]'));
await browser.close();
srv.kill();
