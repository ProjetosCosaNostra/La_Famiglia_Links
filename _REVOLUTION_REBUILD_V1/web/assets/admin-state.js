export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>[...r.querySelectorAll(s)];
export const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
export const badgeClass=v=>['healthy','verified','verified_exact','catalog_verified','accepted','ALLOWED','INTERNAL_ALLOWED'].includes(v)?'ok':['broken','blocked','rejected','conflict'].includes(v)?'off':'warn';

export const state={
  token:sessionStorage.getItem('bg-admin-token')||'',
  products:[],
  campaignData:{campaigns:[],worker_runs:[]},
  reconciliationData:{evidence:[]},
  operationsData:{channels:[],runs:[],link_health:[]},
  editing:null
};

export async function api(path,options={}){
  const headers={accept:'application/json','content-type':'application/json',...(options.headers||{})};
  if(state.token)headers['x-admin-token']=state.token;
  const r=await fetch(path,{...options,headers});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(body.error||`HTTP ${r.status}`);
  return body;
}

export const viewTitles={
  dashboard:'Dashboard',products:'Produtos',links:'Saúde e identidade dos links',
  reconciliation:'Reconciliação Mercado Livre',campaigns:'Campanhas',operations:'Central de Operação'
};

export function setView(name){
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $(`#${name}-view`)?.classList.add('active-view');
  if($('#view-title'))$('#view-title').textContent=viewTitles[name]||name;
  document.dispatchEvent(new CustomEvent('bg:view',{detail:{name}}));
}
