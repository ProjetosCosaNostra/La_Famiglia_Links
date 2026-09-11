(() => {
  const langs = [...document.querySelectorAll('.lang')];
  langs.forEach(button => button.addEventListener('click', () => {
    langs.forEach(item => item.classList.remove('active'));
    button.classList.add('active');
  }));

  const menu = document.querySelector('.menu');
  menu?.addEventListener('click', () => {
    document.querySelector('#ecossistema')?.scrollIntoView({ behavior: 'smooth' });
  });

  const chips = [...document.querySelectorAll('.chip')];
  chips.forEach(button => button.addEventListener('click', () => {
    chips.forEach(item => item.classList.remove('active'));
    button.classList.add('active');
  }));
})();
