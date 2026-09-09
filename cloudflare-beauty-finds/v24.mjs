import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');

const authorities = [
  ['authority-desktop-v26.webp', 1485670, 'af73fabc1806cf2b213570617c86ece3c977a4db877f99a6af6ed32a506f6d5a'],
  ['authority-mobile-v24.webp', 426900, '8c817a1bcf7641fddbf1a083ae9c1bf195186e65cf48d5cdb86ed64452de2a26'],
  ['authority-left-edge-v28.webp', 32242, '627116067cc9dd5fd6e196d694eb1008b78d3fcf3ba9d9f1f6d71b88b03cacec'],
  ['authority-right-edge-v28.webp', 52614, '70c68d65d4dac0b837d1eb14c2e6a50d8198d57cdd2a58cefc3bfe74d7639696'],

];
for (const [name, size, sha] of authorities) {
  const src = path.join(here, name);
  const data = await fs.readFile(src);
  if (data.length !== size) throw new Error(`${name} size mismatch: ${data.length}`);
  if (crypto.createHash('sha256').update(data).digest('hex') !== sha) throw new Error(`${name} SHA-256 mismatch`);
  await fs.copyFile(src, path.join(out, name));
}

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="theme-color" content="#080604"/>
<title>BlackGold Beauty Finds</title>
<style>html,body{margin:0;padding:0;width:100%;min-height:100%;background:#080604;overflow-x:hidden}.bg24{position:relative;width:100%;max-width:none;margin:0}.bg24 picture,.bg24 img{display:block;width:100%;height:auto}@media(min-width:761px){html,body{height:100%;min-height:100%;overflow:hidden}body{position:relative;isolation:isolate}body::before,body::after{content:'';position:fixed;top:0;bottom:0;z-index:-1;width:max(0px,calc((100vw - min(100vw,calc(100vh * 1448 / 1086)))/2 + 1px));background-size:100% 100%;background-repeat:no-repeat}body::before{left:0;background-image:url('./authority-left-edge-v28.webp');background-position:right center}body::after{right:0;background-image:url('./authority-right-edge-v28.webp');background-position:left center}.bg24{width:min(100vw,calc(100vh * 1448 / 1086));height:min(100vh,calc(100vw * 1086 / 1448));margin:0 auto}.bg24 picture,.bg24 img{width:100%;height:100%;object-fit:contain}}.hit{position:absolute;display:block;background:transparent;border:0;outline:0;font-size:0;color:transparent;z-index:2}.hit:focus-visible{outline:3px solid #f1c15a;outline-offset:2px;border-radius:4px}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}</style>
</head><body><main class="bg24" aria-label="BlackGold Beauty Finds">
<picture aria-hidden="true"><source media="(max-width:760px)" srcset="./authority-mobile-v24.webp"/><img src="./authority-desktop-v26.webp" width="1448" height="1086" alt=""/></picture>
<section class="sr-only" aria-label="Conteúdo da Home"><h1>Curadoria feminina com presença premium.</h1><p>Moda, beleza e acessórios selecionados em uma experiência mais limpa, elegante e direta.</p><h2>Seleção do Dia</h2><ul><li>Miss Dior Eau de Parfum — R$ 649,90</li><li>Bolsa LouLou Small — R$ 14.890,00</li><li>Sandália Gianvito Rossi — R$ 4.290,00</li></ul><h2>Vitrine Premium</h2><p>Chanel Coco Mademoiselle, Batom Rouge Dior, Creme Facial Lancôme, Óculos Saint Laurent, Relógio Michael Kors, Brinco Swarovski, Scarpin Jimmy Choo e Bolsa Dior Saddle.</p><h2>Ecossistema BlackGold</h2><p>Acesse nossos projetos, redes e canais oficiais.</p></section>
<div class="desktop-hits">`;
const desktopHits = `
<a class="hit d d-logo" href="./index.html" aria-label="Início"></a>
<a class="hit d d-destaque" href="./destaque.html" aria-label="Destaque"></a>
<a class="hit d d-vitrine" href="./vitrine.html" aria-label="Vitrine"></a>
<a class="hit d d-eco" href="./ecossistema.html" aria-label="Ecossistema"></a>
<a class="hit d d-search" href="./vitrine.html#buscar" aria-label="Buscar"></a>
<a class="hit d d-bag" href="./vitrine.html" aria-label="Vitrine"></a>
<a class="hit d d-explore" href="./destaque.html" aria-label="Explorar achados"></a>
<a class="hit d d-openeco" href="./ecossistema.html" aria-label="Abrir ecossistema"></a>
<a class="hit d d-allselection" href="./destaque.html" aria-label="Ver todos os produtos"></a>
<a class="hit d d-detail1" href="./vitrine.html" aria-label="Ver detalhes"></a>
<a class="hit d d-detail2" href="./vitrine.html" aria-label="Ver detalhes"></a>
<a class="hit d d-detail3" href="./vitrine.html" aria-label="Ver detalhes"></a>
<a class="hit d d-allvitrine" href="./vitrine.html" aria-label="Ver toda a vitrine"></a>
<a class="hit d d-hub" href="https://blackgold-beauty-finds-br.pages.dev/" target="_blank" rel="noopener" aria-label="Hub oficial Loja"></a>
<a class="hit d d-instagram" href="https://www.instagram.com/cosanostra.blackgold/" target="_blank" rel="noopener" aria-label="Instagram"></a>
<a class="hit d d-youtube" href="https://www.youtube.com/@cosanostra.blackgold" target="_blank" rel="noopener" aria-label="YouTube"></a>
<a class="hit d d-telegram" href="https://t.me/BlackGoldSociety" target="_blank" rel="noopener" aria-label="Telegram"></a>
<a class="hit d d-github" href="https://github.com/ProjetosCosaNostra" target="_blank" rel="noopener" aria-label="GitHub"></a>
<a class="hit d d-contact" href="mailto:projetoscosanostra@gmail.com" aria-label="Contato"></a>
</div>`;

const mobileHits = `<div class="mobile-hits">
<a class="hit m m-logo" href="./index.html" aria-label="Início"></a>
<a class="hit m m-menu" href="./ecossistema.html" aria-label="Menu"></a>
<a class="hit m m-search" href="./vitrine.html#buscar" aria-label="Buscar"></a>
<a class="hit m m-bag" href="./vitrine.html" aria-label="Vitrine"></a>
<a class="hit m m-explore" href="./destaque.html" aria-label="Explorar achados"></a>
<a class="hit m m-openeco" href="./ecossistema.html" aria-label="Abrir ecossistema"></a>`;
const mobileHits2 = `
<a class="hit m m-allselection" href="./destaque.html" aria-label="Ver todos"></a>
<a class="hit m m-detail" href="./vitrine.html" aria-label="Ver detalhes"></a>
<a class="hit m m-allvitrine" href="./vitrine.html" aria-label="Ver toda a vitrine"></a>
<a class="hit m m-hub" href="https://blackgold-beauty-finds-br.pages.dev/" target="_blank" rel="noopener" aria-label="Hub oficial Loja"></a>
<a class="hit m m-instagram" href="https://www.instagram.com/cosanostra.blackgold/" target="_blank" rel="noopener" aria-label="Instagram"></a>
<a class="hit m m-youtube" href="https://www.youtube.com/@cosanostra.blackgold" target="_blank" rel="noopener" aria-label="YouTube"></a>
<a class="hit m m-telegram" href="https://t.me/BlackGoldSociety" target="_blank" rel="noopener" aria-label="Telegram"></a>
<a class="hit m m-github" href="https://github.com/ProjetosCosaNostra" target="_blank" rel="noopener" aria-label="GitHub"></a>
<a class="hit m m-contact" href="mailto:projetoscosanostra@gmail.com" aria-label="Contato"></a>
</div>`;

const hitCss = `<style>
.d{display:block}.m{display:none}
.d-logo{left:3.5%;top:0;width:18%;height:4.6%}.d-destaque{left:37%;top:0;width:6%;height:4.6%}.d-vitrine{left:44%;top:0;width:5%;height:4.6%}.d-eco{left:50.5%;top:0;width:8%;height:4.6%}.d-search{left:87.5%;top:0;width:4%;height:4.6%}.d-bag{left:91.5%;top:0;width:4%;height:4.6%}
.d-explore{left:4.1%;top:24.7%;width:14.2%;height:4%}.d-openeco{left:18.8%;top:24.7%;width:13%;height:4%}.d-allselection{left:83%;top:38.5%;width:10%;height:3%}
.d-detail1{left:19.7%;top:52.8%;width:12.6%;height:3%}.d-detail2{left:49.7%;top:52.8%;width:12.6%;height:3%}.d-detail3{left:79.2%;top:52.8%;width:12.6%;height:3%}.d-allvitrine{left:85.2%;top:59%;width:8%;height:3%}
.d-hub{left:58.5%;top:78%;width:16.6%;height:4.2%}.d-instagram{left:75.6%;top:78%;width:17%;height:4.2%}.d-youtube{left:58.5%;top:82.5%;width:16.6%;height:4.2%}.d-telegram{left:75.6%;top:82.5%;width:17%;height:4.2%}.d-github{left:58.5%;top:87%;width:16.6%;height:4.2%}.d-contact{left:75.6%;top:87%;width:17%;height:4.2%}
@media(max-width:760px){.d{display:none}.m{display:block}.bg24{width:100%;max-width:none}.m-logo{left:20%;top:0;width:56%;height:4.4%}.m-menu{left:0;top:0;width:13%;height:4.4%}.m-search{left:77%;top:0;width:11.5%;height:4.4%}.m-bag{left:88.5%;top:0;width:11.5%;height:4.4%}.m-explore{left:4%;top:28%;width:50%;height:4.2%}.m-openeco{left:56%;top:28%;width:44%;height:4.2%}.m-allselection{left:78%;top:39.2%;width:22%;height:4%}.m-detail{left:58%;top:49.8%;width:42%;height:4.1%}.m-allvitrine{left:78%;top:58.1%;width:22%;height:4%}
.m-hub{left:5%;top:81.8%;width:48%;height:4.3%}.m-instagram{left:56%;top:81.8%;width:44%;height:4.3%}.m-youtube{left:5%;top:86.6%;width:48%;height:4.3%}.m-telegram{left:56%;top:86.6%;width:44%;height:4.3%}.m-github{left:5%;top:91.4%;width:48%;height:4.3%}.m-contact{left:56%;top:91.4%;width:44%;height:4.3%}}
</style>`;
const fullHtml = html + desktopHits + mobileHits + mobileHits2 + hitCss + `</main></body></html>`;
await fs.writeFile(path.join(out, 'index.html'), fullHtml, 'utf8');

const built = await fs.readFile(path.join(out, 'index.html'), 'utf8');
for (const required of ['authority-desktop-v26.webp','authority-mobile-v24.webp','authority-left-edge-v28.webp','authority-right-edge-v28.webp','BLACKGOLD Beauty Finds']) {
  if (!built.toLowerCase().includes(required.toLowerCase())) throw new Error(`V24 authority marker missing: ${required}`);
}
console.log('BlackGold V24 raster authority materialized; production remains untouched.');

