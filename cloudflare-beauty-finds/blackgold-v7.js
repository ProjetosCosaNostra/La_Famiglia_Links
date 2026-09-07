(() => {
  const map = {pt:'pt-BR',en:'en-US',es:'es-419'};
  const stored = localStorage.getItem('blackgold_locale');
  const detected = (navigator.language || 'en').toLowerCase().startsWith('pt')?'pt':(navigator.language||'').toLowerCase().startsWith('es')?'es':'en';
  const active = stored || detected;
  document.querySelectorAll('.lang').forEach(b=>{
    b.classList.toggle('is-active', b.dataset.lang===active);
    b.addEventListener('click',()=>{
      localStorage.setItem('blackgold_locale', b.dataset.lang);
      document.documentElement.lang = map[b.dataset.lang] || 'en-US';
      location.reload();
    });
  });
  document.documentElement.lang = map[active] || 'en-US';
})();
