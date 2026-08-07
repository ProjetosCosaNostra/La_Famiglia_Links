const BG={data:null,compare:new Set(readStorageArray('bg_compare'))};
const qs=(s,c=document)=>c.querySelector(s);
const qsa=(s,c=document)=>[...c.querySelectorAll(s)];

function readStorageArray(key){
  try{
    const raw=localStorage.getItem(key);
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return parsed.filter(v=>typeof v==='string'&&v.length<=120);
  }catch(e){
    try{localStorage.removeItem(key);}catch(_){}
    return [];
  }
}
function writeStorage(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){return false}
}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function ensureRuntimeStyles(){
  if(document.querySelector('link[data-bg-runtime-v39]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='runtime-v3.9.css';link.dataset.bgRuntimeV39='true';
  document.head.appendChild(link);
}
function ensureToast(){
  let toast=document.getElementById('bgToast');
  if(toast)return toast;
  toast=document.createElement('div');
  toast.id='bgToast';toast.className='bg-toast';toast.setAttribute('role','status');
  toast.setAttribute('aria-live','polite');toast.setAttribute('aria-atomic','true');toast.hidden=true;
  document.body.appendChild(toast);return toast;
}
let toastTimer=null;
function showToast(message){
  const toast=ensureToast();toast.textContent=message;toast.hidden=false;toast.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.classList.remove('show');toast.hidden=true},3600);
}
function initMenu(){
  const b=qs('.menu'),n=qs('.nav');if(!b||!n)return;
  b.addEventListener('click',()=>{const open=n.classList.toggle('open');b.setAttribute('aria-expanded',String(open))});
}
function validateDataset(payload){
  if(!payload||!Array.isArray(payload.products))throw new Error('catalog schema unavailable');
  const seen=new Set();
  payload.products=payload.products.filter(p=>{
    if(!p||typeof p.id!=='string'||typeof p.slug!=='string'||seen.has(p.id))return false;
    seen.add(p.id);return true;
  });
  return payload;
}
async function data(){
  if(BG.data)return BG.data;
  const r=await fetch('data/products.json',{cache:'no-store'});
  if(!r.ok)throw new Error('catalog unavailable');
  BG.data=validateDataset(await r.json());
  reconcileCompare(BG.data.products);
  return BG.data;
}
function reconcileCompare(products){
  const valid=new Set(products.map(p=>p.id)),before=BG.compare.size;
  BG.compare=new Set([...BG.compare].filter(id=>valid.has(id)).slice(0,3));
  if(BG.compare.size!==before)saveCompare(false);
}
function saveCompare(announce=true){
  writeStorage('bg_compare',[...BG.compare]);updateCompareUI();
  if(announce)document.dispatchEvent(new CustomEvent('blackgold:compare-updated',{detail:{count:BG.compare.size}}));
}
function updateCompareUI(){
  qsa('[data-compare-count]').forEach(x=>x.textContent=String(BG.compare.size));
  const tray=qs('#compareTray'),txt=qs('#compareTrayText');
  if(tray){tray.hidden=BG.compare.size===0;if(txt)txt.textContent=`${BG.compare.size} of 3 saved`}
}
function buttonsForCompareId(id,scope=document){return qsa('[data-compare-id]',scope).filter(b=>b.dataset.compareId===id)}
function paintCompareButton(button,id){
  const saved=BG.compare.has(id);button.classList.toggle('active',saved);
  button.setAttribute('aria-pressed',String(saved));button.textContent=saved?'Saved to compare':'Save to compare';
}
function toggleCompare(id){
  if(typeof id!=='string'||!id)return;
  if(BG.compare.has(id)){BG.compare.delete(id);showToast('Removed from the comparison desk.')}
  else if(BG.compare.size<3){BG.compare.add(id);showToast('Saved to the comparison desk.')}
  else{showToast('The comparison desk holds up to three products. Remove one before adding another.');return}
  saveCompare();buttonsForCompareId(id).forEach(b=>paintCompareButton(b,id));
}
function imgAttrs(p,decorative=false){
  return `src="${esc(p.image)}" ${decorative?'alt=""':'alt="'+esc(p.name)+' product research illustration"'} loading="lazy" decoding="async"`;
}
function loadV39Views(){
  if(document.querySelector('script[data-bg-v39-views]'))return;
  const s=document.createElement('script');s.src='app-views-v3.9.js';s.defer=true;s.dataset.bgV39Views='true';
  document.head.appendChild(s);
}
ensureRuntimeStyles();
loadV39Views();
