/* loja.js — Loja Completa Cosa Nostra
   Refeito para a página pública: loja, produto do dia com galeria/zoom,
   mobile tipo Vitrine Rápida, relatórios preservados. */
(function(){
  'use strict';

  var PRODUCTS_URL = './produtos.json?ts=' + Date.now();
  var PAGE_SIZE = 60;
  var state = { products: [], active: [], visible: [], limit: PAGE_SIZE, query: '', tag: '', sort: 'relev', updated_at: '' };

  function qs(s, r){ return (r || document).querySelector(s); }
  function qsa(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function safe(v){ return v === null || v === undefined ? '' : String(v); }
  function trim(v){ return safe(v).replace(/^\s+|\s+$/g,''); }
  function lower(v){ return safe(v).toLowerCase(); }
  function esc(v){ return safe(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function norm(v){ return lower(v).normalize ? lower(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'') : lower(v); }

  function toast(msg){ var el=qs('#toast'); if(!el) return; el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(function(){el.classList.remove('show');},2200); }
  function copyText(text){
    text = safe(text);
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){toast('Copiado ✅');}).catch(function(){fallbackCopy(text);});
    } else fallbackCopy(text);
  }
  function fallbackCopy(text){ var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); toast('Copiado ✅');}catch(e){toast('Não consegui copiar');} ta.remove(); }
  function downloadText(name, text, type){ var blob=new Blob([text],{type:type||'text/plain;charset=utf-8'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},0); }

  function ensureHttp(u){ u=trim(u); if(!u) return ''; if(/^https?:\/\//i.test(u)) return u; if(u.indexOf('//')===0) return 'https:'+u; if(/^(meli\.|mercadolivre\.|mercadolibre\.)/i.test(u) || u.indexOf('meli.la/')===0 || u.indexOf('meli.co/')===0) return 'https://' + u; return u; }
  function looksImage(u){ u=trim(u); return !!(u && (u.indexOf('github.com/user-attachments/assets/')>-1 || u.indexOf('raw.githubusercontent.com/')>-1 || /^data:image\//i.test(u) || /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(u))); }
  function pushImage(out, v){
    if(!v) return;
    if(Array.isArray(v)){ v.forEach(function(x){pushImage(out,x);}); return; }
    if(typeof v === 'object'){ pushImage(out, v.url || v.src || v.image || v.image_url || v.href); return; }
    safe(v).split(/[\n,;|]+/).map(function(x){return ensureHttp(trim(x));}).forEach(function(u){ if(looksImage(u) && out.map(lower).indexOf(lower(u))<0) out.push(u); });
  }
  function productImages(p){ var out=[]; pushImage(out,p.image_url || p.image || p.img); pushImage(out,p.images); pushImage(out,p.gallery_images); pushImage(out,p.gallery); pushImage(out,p.galeria); pushImage(out,p.extra_images); for(var i=2;i<=12;i++){ pushImage(out,p['image_'+i]); pushImage(out,p['imagem_'+i]); pushImage(out,p['image'+i]); pushImage(out,p['imagem'+i]); } return out; }

  function title(p){ return trim(p.title || p.name || p.sku || 'Produto'); }
  function sku(p){ return trim(p.sku || p.id || p.id_busca || title(p)); }
  function tags(p){ var b=p.badges || p.tags || []; if(typeof b==='string') b=b.split(','); if(!Array.isArray(b)) b=[]; return b.map(trim).filter(Boolean); }
  function mlId(p){ return trim(p.id_busca || p.ml_id || p.id_ml || p.mercadolivre_id || ''); }
  function buyUrl(p){ return ensureHttp(p.open_url || p.short_url || p.relink_open_url || p.canonical_url || p.check_url || p.resolved_url || ''); }
  function promo(p){ return { current: trim(p.price_text || p.current_price_text || p.preco_atual || p.price || p.preco), old: trim(p.old_price_text || p.previous_price_text || p.preco_de || p.preco_anterior || p.old_price), discount: trim(p.discount_text || p.desconto || p.offer_badge || p.sale_badge), checked: trim(p.price_checked_at || p.preco_conferido_em || p.price_checked), note: trim(p.promo_text || p.price_note || p.offer_text || p.preco_observacao), cta: trim(p.buy_cta || p.cta_text || '') }; }
  function isActive(p){ return p && p.active !== false && p.disabled !== true; }
  function isFeatured(p){ return p && (p.featured === true || p.is_featured === true); }

  function formatDate(iso){ if(!iso) return '--'; var d=new Date(iso); if(isNaN(d.getTime())) return safe(iso).slice(0,10); var dd=String(d.getDate()).padStart(2,'0'); var mm=String(d.getMonth()+1).padStart(2,'0'); var hh=String(d.getHours()).padStart(2,'0'); var mi=String(d.getMinutes()).padStart(2,'0'); return dd+'/'+mm+', '+hh+':'+mi; }

  function mediaHTML(p, kind){
    var imgs = productImages(p); var first = imgs[0] || ''; var count = imgs.length;
    var encoded = esc(JSON.stringify(imgs));
    var html = '<div class="cnMedia cnMedia--'+esc(kind)+'" data-gallery-index="0" data-gallery-title="'+esc(title(p))+'" data-gallery-images="'+encoded+'">';
    if(first) html += '<img data-cnimg="1" src="'+esc(first)+'" alt="'+esc(title(p))+'" loading="lazy" />';
    else html += '<div class="noImage">Sem imagem</div>';
    if(kind === 'featured') html += '<span class="cnGalleryBadge">⭐ Produto do dia</span>';
    if(count>1){
      html += '<span class="cnGalleryCount">1/'+count+'</span>';
      html += '<button class="cnGalleryNav cnGalleryNav--prev is-hidden" type="button" data-action="galleryPrev">‹</button>';
      html += '<button class="cnGalleryNav cnGalleryNav--next" type="button" data-action="galleryNext">›</button>';
      html += '<div class="cnGalleryDots">';
      for(var i=0;i<count;i++) html += '<button class="cnGalleryDot '+(i===0?'is-active':'')+'" type="button" data-action="gallerySet" data-index="'+i+'" aria-label="Imagem '+(i+1)+'"></button>';
      html += '</div>';
    }
    if(first && kind === 'featured') html += '<button class="cnGalleryZoom" type="button" data-action="galleryZoom">🔍 Ampliar</button>';
    html += '</div>';
    return html;
  }

  function promoHTML(p){ var pr=promo(p); if(!(pr.current || pr.old || pr.discount || pr.note || pr.checked)) return ''; return '<div class="cnPromoBox"><div class="cnPromoHead"><span>Preço em destaque</span>'+(pr.discount?'<span class="cnDiscount">'+esc(pr.discount)+'</span>':'')+'</div><div class="cnPrices">'+(pr.current?'<strong class="cnPriceNow">'+esc(pr.current)+'</strong>':'')+(pr.old?'<span class="cnPriceOld">'+esc(pr.old)+'</span>':'')+'</div>'+(pr.note?'<div class="cnPromoNote">'+esc(pr.note)+'</div>':'')+(pr.checked?'<div class="cnPromoChecked">Preço conferido em '+esc(pr.checked)+'. Pode mudar no Mercado Livre.</div>':'')+'</div>'; }

  function featuredHTML(p){
    if(!p) return '<div class="emptyState">Nenhum Produto do Dia definido.</div>';
    var pr=promo(p); var url=buyUrl(p); var id=mlId(p); var t=tags(p).slice(0,8);
    return '<article class="cnFeaturedProduct">'
      + mediaHTML(p,'featured')
      + '<div class="cnFeaturedInfo"><div class="cnFeaturedKicker">Produto impulsionado de hoje</div>'
      + '<h1 class="cnFeaturedTitle">'+esc(title(p))+'</h1>'
      + '<p class="cnFeaturedSub">Achado selecionado pela curadoria para facilitar sua compra.</p>'
      + promoHTML(p)
      + '<div class="cnBadgesLine">'+t.map(function(x){return '<span>'+esc(x)+'</span>';}).join('')+'</div>'
      + (id?'<div class="cnIdBox">Código de busca: <b>'+esc(id)+'</b></div>':'')
      + '<div class="cnFeaturedActions">'
      + (url?'<a class="btn btn--gold cnBuy" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(pr.cta || (pr.current?'Comprar com desconto no Mercado Livre':'Comprar agora'))+'</a>':'<button class="btn btn--gold cnBuy" disabled>Indisponível</button>')
      + (id?'<button class="btn btn--glass" type="button" data-action="copyId" data-sku="'+esc(sku(p))+'">Copiar ID</button>':'')
      + '<button class="btn btn--glass" type="button" data-action="copyLink" data-sku="'+esc(sku(p))+'">Copiar Link</button>'
      + (p.alt_url?'<button class="btn btn--glass" type="button" data-action="copyAlt" data-sku="'+esc(sku(p))+'">Link Alt</button>':'')
      + '</div></div></article>';
  }

  function cardHTML(p){
    var url=buyUrl(p), id=mlId(p), tg=tags(p), pr=promo(p);
    return '<article class="pCard" data-sku="'+esc(sku(p))+'">'
      + '<div class="pImg">'+(isFeatured(p)?'<span class="pFeatured">⭐ do dia</span>':'')+(productImages(p)[0]?'<img src="'+esc(productImages(p)[0])+'" alt="'+esc(title(p))+'" loading="lazy" />':'<div class="noImage">Sem imagem</div>')+'</div>'
      + '<div class="pBody"><h3 class="pName">'+esc(title(p))+'</h3>'
      + (tg.length?'<p class="pSmall">'+esc(tg.slice(0,4).join(' • '))+'</p>':'')
      + (pr.current?'<div class="pPrice">'+esc(pr.current)+'</div>':'')
      + (id?'<div class="pCode">Código <b>'+esc(id)+'</b></div>':'')
      + '<div class="pActions">'
      + (url?'<a class="smallBtn smallBtnGold" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Comprar</a>':'<button class="smallBtn smallBtnGold" disabled>Indisponível</button>')
      + (id?'<button class="smallBtn" type="button" data-action="copyId" data-sku="'+esc(sku(p))+'">Copiar ID</button>':'')
      + '<button class="smallBtn" type="button" data-action="copyLink" data-sku="'+esc(sku(p))+'">Copiar Link</button>'
      + '</div></div></article>';
  }

  function uniqueBySku(arr){ var seen={}; return arr.filter(function(p){ var k=sku(p); if(!k || seen[k]) return false; seen[k]=1; return true; }); }
  function featuredProduct(){ return state.active.filter(isFeatured).sort(function(a,b){ return Number(b.issue_number||0)-Number(a.issue_number||0); })[0] || state.active[0]; }

  function matches(p){
    var q=norm(state.query); var tag=norm(state.tag);
    var hay=norm([title(p), sku(p), mlId(p), tags(p).join(' '), p.categoria_principal, (p.categorias_secundarias||[]).join(' '), (p.aliases_busca||[]).join(' ')].join(' '));
    if(q && hay.indexOf(q)<0) return false;
    if(tag && hay.indexOf(tag)<0) return false;
    return true;
  }
  function sortList(list){ var l=list.slice(); if(state.sort==='az') l.sort(function(a,b){return title(a).localeCompare(title(b),'pt-BR');}); else if(state.sort==='za') l.sort(function(a,b){return title(b).localeCompare(title(a),'pt-BR');}); else if(state.sort==='recent') l.sort(function(a,b){return Number(b.issue_number||0)-Number(a.issue_number||0);}); else l.sort(function(a,b){ return (isFeatured(b)-isFeatured(a)) || (Number(b.quick_home||0)-Number(a.quick_home||0)) || (Number(b.issue_number||0)-Number(a.issue_number||0)); }); return l; }

  function categories(){
    var groups={};
    state.active.forEach(function(p){
      var list=[]; if(p.categoria_principal) list.push(p.categoria_principal); (p.categorias_secundarias||[]).forEach(function(x){list.push(x);}); tags(p).forEach(function(x){list.push(x);});
      list.forEach(function(x){ x=trim(x); if(!x || x.length>28) return; groups[x]=(groups[x]||0)+1; });
    });
    var preferred=['Beleza','Casa','Tecnologia','Segurança','Carro','Moto','Achados do Dia','Cabelo','Maquiagem','Pampers','Premium'];
    var out=[]; preferred.forEach(function(x){ if(groups[x]) out.push({label:x,n:groups[x]}); });
    Object.keys(groups).sort(function(a,b){return groups[b]-groups[a];}).forEach(function(x){ if(out.some(function(o){return o.label===x;})) return; if(out.length<24) out.push({label:x,n:groups[x]}); });
    return out;
  }
  function renderChips(){
    var el=qs('#tagPrimaryChips'), sec=qs('#tagSecondaryChips'), util=qs('#tagUtilityChips'); if(!el) return;
    var cats=categories(); var html='<button class="tagChip '+(!state.tag?'tagChip--active':'')+'" type="button" data-tag="">👑 Tudo ('+state.active.length+')</button>';
    cats.slice(0,7).forEach(function(c){ html+='<button class="tagChip '+(norm(state.tag)===norm(c.label)?'tagChip--active':'')+'" type="button" data-tag="'+esc(c.label)+'">'+esc(c.label)+' <span>('+c.n+')</span></button>'; }); el.innerHTML=html;
    if(sec) sec.innerHTML=cats.slice(7,17).map(function(c){return '<button class="tagChip '+(norm(state.tag)===norm(c.label)?'tagChip--active':'')+'" type="button" data-tag="'+esc(c.label)+'">'+esc(c.label)+' <span>('+c.n+')</span></button>';}).join('');
    if(util) util.innerHTML=cats.slice(17,28).map(function(c){return '<button class="tagChip '+(norm(state.tag)===norm(c.label)?'tagChip--active':'')+'" type="button" data-tag="'+esc(c.label)+'">'+esc(c.label)+' <span>('+c.n+')</span></button>';}).join('');
  }

  function render(){
    var f=featuredProduct(); var featuredEl=qs('#featured'); if(featuredEl) featuredEl.innerHTML=featuredHTML(f);
    var list=sortList(state.active.filter(matches)); if(f) list=list.filter(function(p){return sku(p)!==sku(f);});
    state.visible=list;
    var shown=list.slice(0,state.limit); var grid=qs('#grid'); if(grid) grid.innerHTML=shown.map(cardHTML).join('');
    var wrap=qs('#loadMoreWrap'); if(wrap) wrap.classList.toggle('hidden', shown.length>=list.length);
    var all=qs('#countAll'); if(all) all.textContent=state.active.length;
    var sh=qs('#countShown'); if(sh) sh.textContent=list.length;
    renderChips();
  }

  function updateGallery(button, mode){
    var media=button.closest('.cnMedia'); if(!media) return; var images=[]; try{images=JSON.parse(media.getAttribute('data-gallery-images')||'[]');}catch(e){}
    if(!images.length) return; var idx=Number(media.getAttribute('data-gallery-index')||0)||0;
    if(mode==='prev') idx=Math.max(0,idx-1); else if(mode==='next') idx=Math.min(images.length-1,idx+1); else if(mode==='set') idx=Math.max(0,Math.min(images.length-1,Number(button.getAttribute('data-index')||0)||0));
    media.setAttribute('data-gallery-index',idx); var img=qs('img[data-cnimg]',media); if(img) img.src=images[idx];
    var count=qs('.cnGalleryCount',media); if(count) count.textContent=(idx+1)+'/'+images.length;
    var prev=qs('.cnGalleryNav--prev',media); var next=qs('.cnGalleryNav--next',media); if(prev) prev.classList.toggle('is-hidden',idx<=0); if(next) next.classList.toggle('is-hidden',idx>=images.length-1);
    qsa('.cnGalleryDot',media).forEach(function(d,i){d.classList.toggle('is-active',i===idx);});
  }
  function ensureLightbox(){ var m=qs('#cnProductLightbox'); if(m) return m; m=document.createElement('div'); m.id='cnProductLightbox'; m.className='cnProductLightbox'; m.innerHTML='<div class="cnProductLightbox__dialog"><button class="cnProductLightbox__close" data-close="1">×</button><button class="cnProductLightbox__nav cnProductLightbox__nav--prev" data-prev="1">‹</button><img class="cnProductLightbox__img" alt="Imagem ampliada"><button class="cnProductLightbox__nav cnProductLightbox__nav--next" data-next="1">›</button><div class="cnProductLightbox__footer"><span class="cnProductLightbox__title"></span><span class="cnProductLightbox__counter"></span></div></div>'; document.body.appendChild(m); m.addEventListener('click',function(e){ if(e.target===m || e.target.getAttribute('data-close')) closeLightbox(); if(e.target.getAttribute('data-prev')) moveLightbox(-1); if(e.target.getAttribute('data-next')) moveLightbox(1);}); document.addEventListener('keydown',function(e){ if(!m.classList.contains('is-open')) return; if(e.key==='Escape') closeLightbox(); if(e.key==='ArrowLeft') moveLightbox(-1); if(e.key==='ArrowRight') moveLightbox(1);}); return m; }
  function openLightbox(media){ var images=[]; try{images=JSON.parse(media.getAttribute('data-gallery-images')||'[]');}catch(e){} if(!images.length) return; var m=ensureLightbox(); m._imgs=images; m._idx=Number(media.getAttribute('data-gallery-index')||0)||0; m._title=media.getAttribute('data-gallery-title')||'Produto'; updateLightbox(); m.classList.add('is-open'); }
  function closeLightbox(){ var m=qs('#cnProductLightbox'); if(m) m.classList.remove('is-open'); }
  function moveLightbox(delta){ var m=qs('#cnProductLightbox'); if(!m||!m._imgs) return; m._idx=Math.max(0,Math.min(m._imgs.length-1,(m._idx||0)+delta)); updateLightbox(); }
  function updateLightbox(){ var m=qs('#cnProductLightbox'); if(!m||!m._imgs) return; qs('.cnProductLightbox__img',m).src=m._imgs[m._idx]; qs('.cnProductLightbox__title',m).textContent=m._title; qs('.cnProductLightbox__counter',m).textContent=(m._idx+1)+'/'+m._imgs.length; qs('.cnProductLightbox__nav--prev',m).classList.toggle('is-hidden',m._idx<=0); qs('.cnProductLightbox__nav--next',m).classList.toggle('is-hidden',m._idx>=m._imgs.length-1); }

  function findProduct(k){ k=safe(k); return state.products.filter(function(p){return sku(p)===k;})[0]; }
  function exportSmart(){ var f=featuredProduct(); var lines=[]; lines.push('RELATÓRIO INTELIGENTE — COSA NOSTRA'); lines.push('Atualizado: '+formatDate(state.updated_at)); lines.push('Ativos: '+state.active.length); lines.push('Produto do Dia: '+(f?title(f):'nenhum')); if(f){lines.push('Código: '+mlId(f)); lines.push('Preço: '+(promo(f).current||'')); lines.push('Link: '+buyUrl(f));} lines.push(''); lines.push('Produtos visíveis: '+state.visible.length); state.visible.slice(0,80).forEach(function(p,i){lines.push((i+1)+'. '+title(p)+' | '+mlId(p)+' | '+buyUrl(p));}); downloadText('relatorio_inteligente_cosanostra.txt',lines.join('\n')); }
  function exportCsv(){ var cols=['sku','title','id_busca','price_text','open_url','active','featured']; var rows=[cols.join(';')]; state.products.forEach(function(p){ rows.push(cols.map(function(c){return '"'+safe(p[c]).replace(/"/g,'""')+'"';}).join(';')); }); downloadText('produtos_cosanostra.csv',rows.join('\n'),'text/csv;charset=utf-8'); }
  function exportMaintenance(){ var lines=['MANUTENÇÃO DE LINKS — COSA NOSTRA','Gerado em: '+new Date().toLocaleString('pt-BR'),'']; state.products.forEach(function(p){ if(p.review_status && p.review_status!=='ativo') lines.push(title(p)+' | '+p.review_status+' | '+mlId(p)+' | '+buyUrl(p)); }); if(lines.length<4) lines.push('Nenhum produto marcado para revisão no momento.'); downloadText('link_guardian_manutencao.txt',lines.join('\n')); }

  function bind(){
    var search=qs('#searchInput'); if(search) search.addEventListener('input',function(){state.query=this.value; state.limit=PAGE_SIZE; render();});
    var sort=qs('#sortSelect'); if(sort) sort.addEventListener('change',function(){state.sort=this.value; render();});
    var clear=qs('#clearFilters'); if(clear) clear.addEventListener('click',function(){state.query='';state.tag='';state.limit=PAGE_SIZE;if(search)search.value='';render();});
    var more=qs('#loadMore'); if(more) more.addEventListener('click',function(){state.limit+=PAGE_SIZE; render();});
    var refresh=qs('#btnRefresh'); if(refresh) refresh.addEventListener('click',function(){location.reload();});
    var copyStore=qs('#copyStoreLink'); if(copyStore) copyStore.addEventListener('click',function(){copyText(location.origin + location.pathname);});
    var smart=qs('#btnSmartReport'); if(smart) smart.addEventListener('click',exportSmart);
    var csv=qs('#btnDlCsvAll'); if(csv) csv.addEventListener('click',exportCsv);
    var review=qs('#btnDlReview'); if(review) review.addEventListener('click',exportMaintenance);
    var copyList=qs('#btnCopyList'); if(copyList) copyList.addEventListener('click',function(){copyText(state.active.map(function(p){return title(p)+' — '+mlId(p)+' — '+buyUrl(p);}).join('\n'));});
    document.addEventListener('click',function(e){
      var chip=e.target.closest('[data-tag]'); if(chip){ state.tag=chip.getAttribute('data-tag')||''; state.limit=PAGE_SIZE; render(); return; }
      var action=e.target.closest('[data-action]'); if(action){ var act=action.getAttribute('data-action'); if(act==='galleryPrev'||act==='galleryNext'||act==='gallerySet'){ e.preventDefault(); updateGallery(action,act==='galleryPrev'?'prev':act==='galleryNext'?'next':'set'); return; } if(act==='galleryZoom'){ e.preventDefault(); var media=action.closest('.cnMedia'); if(media) openLightbox(media); return; } var p=findProduct(action.getAttribute('data-sku')); if(!p) return; if(act==='copyId') copyText(mlId(p)); if(act==='copyLink') copyText(buyUrl(p)); if(act==='copyAlt') copyText(p.alt_url || p.canonical_url || p.check_url || ''); }
    });
  }

  fetch(PRODUCTS_URL,{cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error('produtos.json não encontrado'); return r.json(); }).then(function(data){ state.updated_at=data.updated_at||''; state.products=uniqueBySku(Array.isArray(data)?data:(data.products||[])).map(function(p){return Object.assign({},p,{images:productImages(p)});}); state.active=state.products.filter(isActive); var upd=qs('#lastUpdate'); if(upd) upd.textContent=formatDate(state.updated_at); render(); bind(); }).catch(function(err){ console.error(err); var f=qs('#featured'); if(f) f.innerHTML='<div class="emptyState">Erro ao carregar produtos.json</div>'; toast('Erro ao carregar produtos'); });
})();
