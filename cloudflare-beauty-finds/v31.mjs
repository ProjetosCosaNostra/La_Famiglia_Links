import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,'dist');
await fs.copyFile(path.join(here,'blackgold-home-v31-fullwidth.css'),path.join(out,'blackgold-home-v31-fullwidth.css'));
const p=path.join(out,'index.html');
let html=await fs.readFile(p,'utf8');
html=html.replace(/<link rel="stylesheet" href="\.\/blackgold-home-v31-fullwidth\.css\?v=[^"]+"\/>/g,'');
html=html.replace('</head>','<link rel="stylesheet" href="./blackgold-home-v31-fullwidth.css?v=20260909-v31"/><meta name="blackgold-build" content="V31_NATIVE_FULLWIDTH"/></head>');
await fs.writeFile(p,html,'utf8');
console.log('BlackGold V31 native full-width desktop applied; no raster authority layer.');
