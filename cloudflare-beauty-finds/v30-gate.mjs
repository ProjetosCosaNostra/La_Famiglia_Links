import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gate = path.join(here, 'tools', 'v24_interaction_matrix.mjs');
let source = await fs.readFile(gate, 'utf8');
const startMarker = "await test('desktop_viewport_fit_with_edge_extensions',async()=>{";
const endMarker = "await test('mobile_geometry_and_visibility'";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('V30 wide-desktop gate target not found');

const replacement = `await test('desktop_wide_integrity_without_information_distortion',async()=>{await viewport(1914,955);await nav(base+'/');const x=await evalv(\`(()=>{const root=document.querySelector('.bg24'),img=document.querySelector('.bg24 picture img'),rr=root.getBoundingClientRect(),ir=img.getBoundingClientRect(),ls=getComputedStyle(root,'::before'),rs=getComputedStyle(root,'::after');return {innerWidth,innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,root:{x:rr.x,w:rr.width,h:rr.height,bottom:rr.bottom},image:{x:ir.x,w:ir.width,h:ir.height,bottom:ir.bottom},left:{bg:ls.backgroundImage,w:parseFloat(ls.width),filter:ls.filter},right:{bg:rs.backgroundImage,w:parseFloat(rs.width),filter:rs.filter}}})()\`);const expectedW=1448,expectedH=1086,expectedX=(1914-expectedW)/2;const sidesOk=(x.left.bg||'').includes('radial-gradient')&&(x.left.bg||'').includes('linear-gradient')&&(x.right.bg||'').includes('radial-gradient')&&(x.right.bg||'').includes('linear-gradient')&&x.left.filter==='none'&&x.right.filter==='none'&&Math.abs(x.left.w-(expectedX+1))<2&&Math.abs(x.right.w-(expectedX+1))<2;const bad=x.innerWidth!==1914||x.innerHeight!==955||x.scrollWidth!==1914||x.scrollHeight<expectedH||Math.abs(x.root.x-expectedX)>1||Math.abs(x.root.w-expectedW)>1||Math.abs(x.root.h-expectedH)>1||Math.abs(x.image.w-expectedW)>1||Math.abs(x.image.h-expectedH)>1||!sidesOk;if(bad)throw new Error('wide-integrity '+JSON.stringify({x,expectedW,expectedH,expectedX,sidesOk}));return {...x,expectedW,expectedH,expectedX,nativeScale:true,verticalScrollExpected:true,sectionBackgroundExtensions:true};});\n`;
source = source.slice(0, start) + replacement + source.slice(end);
if (source.includes('desktop_viewport_fit_with_edge_extensions')) throw new Error('Legacy squeeze gate still present');
if (!source.includes('desktop_wide_integrity_without_information_distortion')) throw new Error('V30 integrity gate missing');
await fs.writeFile(gate, source, 'utf8');
console.log('BlackGold V30 runtime gate aligned: 1448x1086 canonical desktop stays native-scale inside wide viewports; vertical scroll is valid.');
