(()=>{
  const menu=document.querySelector('[data-menu]');
  const nav=document.querySelector('.main-nav');
  if(menu&&nav){menu.addEventListener('click',()=>nav.classList.toggle('open'));}
  document.querySelectorAll('.lang').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.lang').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}));
  document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{const wrap=btn.parentElement;wrap?.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}));
})();
