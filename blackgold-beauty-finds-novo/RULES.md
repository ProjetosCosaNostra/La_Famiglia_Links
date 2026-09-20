# BLACKGOLD BEAUTY FINDS — VISUAL AUTHORITY LOCK V3

- Public catalog starts with **0 real products**.
- No demo product, price, count, image or placeholder may persist outside isolated CI fixtures.
- Desktop authority is pinned at `assets/authority-desktop-approved.png` — **1448×1086**.
- Mobile authority is pinned at `assets/authority-mobile-v24.webp` — **390×1152**.
- The approved authority remains untouched outside the three legitimate dynamic regions: catalog count, Seleção do Dia cards and Vitrine Premium cards.
- Difference outside those dynamic regions has **0 pixel tolerance**.
- Dynamic product cards must pass footprint, style and region-acceptance gates against the approved authority.
- Pixel diagnostics inside product regions are evidence, not permission to show a preview.
- Preview must never auto-open.
- Production deployment remains blocked until Felipe gives explicit human approval.
- Desktop must fill the viewport width; never fit-to-height into a narrow centered page.
- The old zero-authority rasters are not visual authorities and must not be used to approve a preview.
