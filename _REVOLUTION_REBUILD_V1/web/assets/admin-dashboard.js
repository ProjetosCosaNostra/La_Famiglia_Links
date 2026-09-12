import {$,esc,state} from './admin-state.js';

export function renderDashboard(){
  const active=state.products.filter(p=>p.status==='active');
  const ready=active.filter(p=>p.affiliate_ready);
  const links=state.products.flatMap(p=>p.links||[]).filter(l=>Number(l.is_active)!==0);
  const exact=links.filter(l=>l.marketplace_identity_status==='verified_exact'&&Number(l.variant_match)).length;
  $('#dashboard-view').textContent=`Ativos ${active.length} · Ready ${ready.length} · Exact ${exact}`;
}
