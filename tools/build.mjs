// Build the page: one bundle for the game, the page beside it, the link's
// picture. The server serves dist/web as it is. `npm run build`
import fs from 'node:fs';
import * as esbuild from 'esbuild';

const out = 'dist/web';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const r = await esbuild.build({
  entryPoints: ['src/client/main.js'],
  bundle: true, format: 'esm', minify: true, sourcemap: false, target: ['es2020'],
  outfile: `${out}/main.js`, metafile: true, logLevel: 'warning',
  legalComments: 'none',
});
// a new build is a new address for the script, so no phone keeps an old one
const hash = (await import('node:crypto')).createHash('sha1').update(fs.readFileSync(`${out}/main.js`)).digest('hex').slice(0, 10);
fs.renameSync(`${out}/main.js`, `${out}/main.${hash}.js`);
fs.writeFileSync(`${out}/index.html`, fs.readFileSync('src/client/index.html', 'utf8').replace('./main.js', `./main.${hash}.js`));
for (const f of ['og.jpg', 'icon.png', 'apple-touch-icon.png', 'manifest.webmanifest']) fs.existsSync(`src/client/${f}`) && fs.copyFileSync(`src/client/${f}`, `${out}/${f}`);
const kb = Math.round(fs.statSync(`${out}/main.${hash}.js`).size / 1024);
console.log(`dist/web: main.${hash}.js ${kb} KB`);
