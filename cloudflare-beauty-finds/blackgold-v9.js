(()=>{
  // V10 visual layer: preserve stable markup and progressively upgrade the visual contract.
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

  document.querySelectorAll('.admin-lock').forEach(el=>el.setAttribute('aria-hidden','true'));

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
})();
