import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
const parts = [];
for (let i = 0; i < 6; i++) {
  const name = `mobile-hero-authority-v19.part${String(i).padStart(2,'0')}.b64`;
  parts.push(await fs.readFile(path.join(here, 'assets-source', name), 'utf8'));
}
const raw = parts.join('').replace(/\s+/g, '');
const image = Buffer.from(raw, 'base64');
if (image.length !== 17870) throw new Error(`V19 mobile hero authority size mismatch: ${image.length}`);
if (image.subarray(0,4).toString('ascii') !== 'RIFF' || image.subarray(8,12).toString('ascii') !== 'WEBP') throw new Error('V19 mobile hero authority is not a valid WEBP container');
await fs.writeFile(path.join(out, 'mobile-hero-authority-v19.webp'), image);
await fs.copyFile(path.join(here, 'blackgold-home-v19-authority.css'), path.join(out, 'blackgold-home-v19-authority.css'));
const index = path.join(out, 'index.html');
let html = await fs.readFile(index, 'utf8');
if (!html.includes('blackgold-home-v19-authority.css')) html = html.replace('</head>', '<link rel="stylesheet" href="./blackgold-home-v19-authority.css?v=20260908-v19"/></head>');
await fs.writeFile(index, html, 'utf8');
console.log('BlackGold V19 mobile hero authority materialized and injected');
