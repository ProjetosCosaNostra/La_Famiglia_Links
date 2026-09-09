import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');

// V19.2 hero authority
const parts = [];
for (let i = 0; i < 6; i++) {
  const name = `mobile-hero-authority-v19-2.part${String(i).padStart(2,'0')}.b64`;
  parts.push(await fs.readFile(path.join(here, 'assets-source', name), 'utf8'));
}
const raw = parts.join('').replace(/\s+/g, '');
const image = Buffer.from(raw, 'base64');
const expectedSize = 16540;
const expectedSha256 = '2fbc7b2e71bbf03a5e518df41613b4a400897a1821907abbc8637c9a3b2837e7';
if (image.length !== expectedSize) throw new Error(`V19.2 mobile hero authority size mismatch: ${image.length}`);
if (image.subarray(0,4).toString('ascii') !== 'RIFF' || image.subarray(8,12).toString('ascii') !== 'WEBP') throw new Error('V19.2 mobile hero authority is not a valid WEBP container');
const sha256 = crypto.createHash('sha256').update(image).digest('hex');
if (sha256 !== expectedSha256) throw new Error(`V19.2 mobile hero authority SHA-256 mismatch: ${sha256}`);
await fs.writeFile(path.join(out, 'mobile-hero-authority-v19-2.webp'), image);

// V20.1 exact mobile Vitrine authority
const vitrineSource = await fs.readFile(path.join(here, 'mobile-vitrine-authority-v20.webp'));
const vitrineExpectedSize = 8906;
const vitrineExpectedSha256 = 'c2acdd9450259221464ae6efb93a6010701197779a44a49688067b2210b7b9b1';
if (vitrineSource.length !== vitrineExpectedSize) throw new Error(`V20.1 Vitrine authority size mismatch: ${vitrineSource.length}`);
if (vitrineSource.subarray(0,4).toString('ascii') !== 'RIFF' || vitrineSource.subarray(8,12).toString('ascii') !== 'WEBP') throw new Error('V20.1 Vitrine authority is not a valid WEBP container');
const vitrineSha256 = crypto.createHash('sha256').update(vitrineSource).digest('hex');
if (vitrineSha256 !== vitrineExpectedSha256) throw new Error(`V20.1 Vitrine authority SHA-256 mismatch: ${vitrineSha256}`);
await fs.writeFile(path.join(out, 'mobile-vitrine-authority-v20.webp'), vitrineSource);

await fs.copyFile(path.join(here, 'blackgold-home-v19-authority.css'), path.join(out, 'blackgold-home-v19-authority.css'));
await fs.copyFile(path.join(here, 'blackgold-home-v19-3-calibration.css'), path.join(out, 'blackgold-home-v19-3-calibration.css'));
await fs.copyFile(path.join(here, 'blackgold-home-v20-authority.css'), path.join(out, 'blackgold-home-v20-authority.css'));

const index = path.join(out, 'index.html');
let html = await fs.readFile(index, 'utf8');
html = html.replace(/<link rel="stylesheet" href="\.\/blackgold-home-v19-authority\.css\?v=[^"]+"\/>/g, '');
html = html.replace(/<link rel="stylesheet" href="\.\/blackgold-home-v19-3-calibration\.css\?v=[^"]+"\/>/g, '');
html = html.replace(/<link rel="stylesheet" href="\.\/blackgold-home-v20-authority\.css\?v=[^"]+"\/>/g, '');
html = html.replace('</head>', '<link rel="stylesheet" href="./blackgold-home-v19-authority.css?v=20260908-v19-2"/><link rel="stylesheet" href="./blackgold-home-v19-3-calibration.css?v=20260908-v19-8"/><link rel="stylesheet" href="./blackgold-home-v20-authority.css?v=20260908-v20-1"/></head>');
await fs.writeFile(index, html, 'utf8');
console.log(`BlackGold V19.2 + V19.8 + V20.1 exact mobile Vitrine ready; hero ${expectedSize} bytes; Vitrine ${vitrineExpectedSize} bytes`);
