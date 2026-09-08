(()=>{
  // Progressive contract layer: preserve stable markup while converging the
  // interactive chrome and ecosystem cards on the approved visual authority.
  const href='./blackgold-v10-overrides.css?v=20260907-v10';
  if(!document.querySelector('link[href^="./blackgold-v10-overrides.css"]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  }

  const iconSvg={
    store:'<svg class="eco-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 9h13l-1 11h-11z"/><path d="M9 9V6.8a3 3 0 0 1 6 0V9"/></svg>',
    instagram:'<svg class="eco-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="4"/><circle class="eco-dot" cx="17.4" cy="6.8" r="1"/></svg>',
    youtube:'<svg class="eco-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3"/><path class="eco-fill" d="m10 9 6 3-6 3z"/></svg>',
    telegram:'<svg class="eco-svg" viewBox="0 0 24 24" aria-hidden="true"><path class="eco-fill" d="M21.4 3.4 3.7 10.2c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 1.7 5.2c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.2-2.1 4.5 3.3c.8.5 1.4.2 1.6-.8l2.8-13.3c.3-1.2-.5-1.8-1.1-1.3ZM9.8 12.8l8.8-5.6c.4-.3.8-.1.5.2l-7.3 6.6-.3 3.2-1.7-4.4Z"/></svg>',
    github:'<svg class="eco-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 1.5-4-2.5-5-3m10 6v-3.9c0-1 .1-1.4-.5-2 2.8-.3 5.7-1.4 5.7-6.2a4.8 4.8 0 0 0-1.3-3.4 4.5 4.5 0 0 0-.1-3.4S16.8 2.8 14 4.4a13 13 0 0 0-5 0C6.2 2.8 5.2 3.1 5.2 3.1a4.5 4.5 0 0 0-.1 3.4 4.8 4.8 0 0 0-1.3 3.4c0 4.8 2.9 5.9 5.7 6.2-.5.5-.6 1.1-.5 2V22"/></svg>',
    contact:'<svg class="eco-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>'
  };

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

  // Replace the temporary diamond kicker with the shield/medallion geometry used
  // by the approved desktop authority. This remains native SVG, not a raster patch.
  document.querySelectorAll('.eco-kicker').forEach(kicker=>{
    kicker.innerHTML='<svg class="kicker-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m8 9 4-2 4 2v5l-4 3-4-3z"/><circle cx="12" cy="12" r="1.2"/></svg><span>ECOSSISTEMA OFICIAL</span>';
  });

  // Home contract: exactly the six compact destinations visible in the approved
  // mockup, each connected to the current official destination.
  const homeEco=document.querySelector('[data-eco-home]');
  if(homeEco){
    const destinations=[
      ['store','Hub oficial / Loja','active • store','https://blackgold-beauty-finds-br.pages.dev/'],
      ['instagram','Instagram','active • social','https://www.instagram.com/cosanostra.blackgold/'],
      ['youtube','YouTube','active • social','https://www.youtube.com/@cosanostra.blackgold'],
      ['telegram','Telegram','active • community','https://t.me/BlackGoldSociety'],
      ['github','GitHub','active • company','https://github.com/ProjetosCosaNostra'],
      ['contact','Contato','active • contact','mailto:projetoscosanostra@gmail.com']
    ];
    homeEco.innerHTML=destinations.map(([kind,label,meta,url])=>{
      const external=!url.startsWith('mailto:');
      return `<a class="eco-link" href="${url}"${external?' rel="noopener" target="_blank"':''}><span class="eco-icon">${iconSvg[kind]}</span><span><b>${label}</b><small>${meta}</small></span><i>›</i></a>`;
    }).join('');
  }

  // Footer wording is part of the approved public contract. Admin remains at
  // /admin.html but is intentionally not advertised in the storefront footer.
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
    const social=[
      ['instagram','Instagram','https://www.instagram.com/cosanostra.blackgold/'],
      ['youtube','YouTube','https://www.youtube.com/@cosanostra.blackgold'],
      ['telegram','Telegram','https://t.me/BlackGoldSociety'],
      ['github','GitHub','https://github.com/ProjetosCosaNostra'],
      ['contact','Contato','mailto:projetoscosanostra@gmail.com']
    ];
    footerSocial.innerHTML=social.map(([kind,label,url])=>`<a href="${url}" aria-label="${label}"${url.startsWith('mailto:')?'':' rel="noopener" target="_blank"'}>${iconSvg[kind].replaceAll('eco-svg','footer-svg')}</a>`).join('');
  }
})();
