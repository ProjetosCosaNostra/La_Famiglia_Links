(() => {
  'use strict';
  const FORBIDDEN = ['Miss Dior','Dior Saddle','R$ 649,90','193 produtos'];
  document.documentElement.dataset.blackgoldAuthority = 'V26_DESKTOP_V24_MOBILE_ZERO_CATALOG';
  document.documentElement.dataset.catalogCount = '0';

  // No old catalogue is created, loaded or injected. The approved raster is visual authority only.
  // When the real admin API is connected, product sections must be rendered above the masks and the masks removed only when actual published products exist.
  const visibleText = document.body.innerText || '';
  const leaked = FORBIDDEN.filter(x => visibleText.includes(x));
  if (leaked.length) {
    document.documentElement.dataset.guard = 'BLOCKED';
    console.error('BLACKGOLD_ZERO_CATALOG_GUARD', leaked);
  } else {
    document.documentElement.dataset.guard = 'PASS';
  }
})();