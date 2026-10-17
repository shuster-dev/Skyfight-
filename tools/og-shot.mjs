// The link's picture (og:image): the title over three planes in formation,
// 1200x630, written to src/client/og.jpg. `npm run build && node tools/og-shot.mjs`
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 3900 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])');
await page.addStyleTag({ content: '#title-form, #corner { display: none !important } .screen.shade { background: radial-gradient(ellipse at center, rgba(8,16,30,0), rgba(8,16,30,.45)) } .logo { width: 560px } .tag { font-size: 26px }' });
await wait(Number(process.env.AT || 9000));
await page.screenshot({ path: 'src/client/og.jpg', type: 'jpeg', quality: 86 });
await browser.close();
srv.kill();
console.log('src/client/og.jpg');
