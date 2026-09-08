(()=>{
  // Progressive contract layer: preserve the stable markup while aligning
  // navigation and the home ecosystem block with the approved visual authority.
  const href='./blackgold-v10-overrides.css?v=20260907-v10';
  if(!document.querySelector('link[href^="./blackgold-v10-overrides.css"]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  }

  const nav=document.querySelector('.main-nav');
  const topbar=document.querySelector('.topbar');
  const menu=document.querySelector('[data-menu]');
  if(menu&&topbar){
    menu.classList.add('mobile-hamburger');
    topbar.insertBefore(menu,topbar.firstChild);
  }
  if(menu&&nav) menu.addEventListener('click',()=>nav.classList.toggle('open'));

  document.querySelectorAll('.admin-lock').forEach(el=>{
    el.setAttribute('aria-hidden','true');
    el.setAttribute('tabindex','-1');
  });

  // The approved home authority shows Destaque as the selected top-level tab.
  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  if(nav&&page==='index.html'){
    nav.querySelectorAll('a').forEach(x=>x.classList.remove('active'));
    nav.querySelector('a[href="./destaque.html"]')?.classList.add('active');
  }

  document.querySelectorAll('.lang').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.lang').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
  }));

  document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{
    const wrap=btn.closest('.filters')||btn.parentElement;
    if(!wrap)return;
    wrap.querySelectorAll('.chip').forEach(x=>x.classList.remove('active','on'));
    btn.classList.add('active','on');
  }));

  // Home contract: keep exactly the six compact destinations present in the
  // approved mockup, but point every card at the current official destination.
  const homeEco=document.querySelector('[data-eco-home]');
  if(homeEco){
    const destinations=[
      ['▣','Hub oficial / Loja','active • store','https://blackgold-beauty-finds-br.pages.dev/'],
      ['◎','Instagram','active • social','https://www.instagram.com/cosanostra.blackgold/'],
      ['▶','YouTube','active • social','https://www.youtube.com/@cosanostra.blackgold'],
      ['➤','Telegram','active • community','https://t.me/BlackGoldSociety'],
      ['◉','GitHub','active • company','https://github.com/ProjetosCosaNostra'],
      ['✉','Contato','active • contact','mailto:projetoscosanostra@gmail.com']
    ];
    homeEco.innerHTML=destinations.map(([icon,label,meta,url])=>{
      const external=!url.startsWith('mailto:');
      return `<a class="eco-link" href="${url}"${external?' rel="noopener" target="_blank"':''}><span class="eco-icon">${icon}</span><span><b>${label}</b><small>${meta}</small></span><i>›</i></a>`;
    }).join('');
  }

  // Footer wording is part of the same approved visual language; the admin
  // remains available at /admin.html but is not advertised in the public footer.
  const footerNav=document.querySelector('.footer nav');
  if(footerNav){
    footerNav.innerHTML=[
      ['Beleza','./vitrine.html#beleza'],
      ['Moda','./vitrine.html#moda'],
      ['Acessórios','./vitrine.html#acessorios'],
      ['Estilo de Vida','./vitrine.html#estilo-de-vida']
    ].map(([label,url])=>`<a href="${url}">${label}</a>`).join('');
  }

  const footerSocial=document.querySelector('.footer-social');
  if(footerSocial){
    footerSocial.innerHTML=[
      ['◎','Instagram','https://www.instagram.com/cosanostra.blackgold/'],
      ['▶','YouTube','https://www.youtube.com/@cosanostra.blackgold'],
      ['➤','Telegram','https://t.me/BlackGoldSociety'],
      ['◉','GitHub','https://github.com/ProjetosCosaNostra'],
      ['✉','Contato','mailto:projetoscosanostra@gmail.com']
    ].map(([icon,label,url])=>`<a href="${url}" aria-label="${label}"${url.startsWith('mailto:')?'':' rel="noopener" target="_blank"'}>${icon}</a>`).join(' ');
  }
})();
