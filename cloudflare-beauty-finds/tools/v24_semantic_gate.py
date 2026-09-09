import argparse, json, re
from html.parser import HTMLParser
from pathlib import Path

class HitParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hits=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        classes=set(a.get('class','').split())
        if tag=='a' and 'hit' in classes:
            self.hits.append((classes,a))

ap=argparse.ArgumentParser()
ap.add_argument('--html', required=True)
ap.add_argument('--report', required=True)
a=ap.parse_args()
html=Path(a.html).read_text(encoding='utf-8')
errors=[]; warnings=[]

def require(ok,msg):
    if not ok: errors.append(msg)

require('class="sr-only"' in html, 'semantic sr-only content missing')
require('<h1>Curadoria feminina com presença premium.</h1>' in html, 'semantic H1 missing')
require('<h2>Seleção do Dia</h2>' in html and '<h2>Vitrine Premium</h2>' in html and '<h2>Ecossistema BlackGold</h2>' in html, 'semantic section headings missing')
require('<picture aria-hidden="true">' in html and 'height="1086" alt=""' in html, 'raster must be hidden from assistive tech')
require('.hit:focus-visible{' in html, 'keyboard focus indicator missing')
require('projetoscosanostra.github.io/La_Famiglia_Links/' not in html, 'legacy Hub URL present')
require('Ã' not in html and '�' not in html, 'mojibake detected')
p=HitParser(); p.feed(html)
require(len(p.hits)>=30, f'expected at least 30 hotspot anchors, got {len(p.hits)}')
for classes,attrs in p.hits:
    require(bool(attrs.get('href')), f'hotspot without href: {classes}')
    require(bool(attrs.get('aria-label')), f'hotspot without aria-label: {classes}')
    href=attrs.get('href','')
    if href.startswith('http'):
        require(attrs.get('target')=='_blank', f'external hotspot missing target blank: {href}')
        require('noopener' in attrs.get('rel','').split(), f'external hotspot missing noopener: {href}')

expected={
'd-hub':'https://blackgold-beauty-finds-br.pages.dev/', 'm-hub':'https://blackgold-beauty-finds-br.pages.dev/',
'd-instagram':'https://www.instagram.com/cosanostra.blackgold/', 'm-instagram':'https://www.instagram.com/cosanostra.blackgold/',
'd-youtube':'https://www.youtube.com/@cosanostra.blackgold', 'm-youtube':'https://www.youtube.com/@cosanostra.blackgold',
'd-telegram':'https://t.me/BlackGoldSociety', 'm-telegram':'https://t.me/BlackGoldSociety',
'd-github':'https://github.com/ProjetosCosaNostra', 'm-github':'https://github.com/ProjetosCosaNostra',
'd-contact':'mailto:projetoscosanostra@gmail.com', 'm-contact':'mailto:projetoscosanostra@gmail.com'}
by_class={}
for classes,attrs in p.hits:
    for c in classes: by_class[c]=attrs
for c,href in expected.items():
    require(c in by_class, f'missing hotspot {c}')
    if c in by_class: require(by_class[c].get('href')==href, f'{c} wrong href: {by_class[c].get("href")}')
css='\n'.join(re.findall(r'<style>(.*?)</style>',html,re.S))
mobile=['m-menu','m-search','m-bag','m-explore','m-openeco','m-allselection','m-detail','m-allvitrine','m-hub','m-instagram','m-youtube','m-telegram','m-github','m-contact']
for c in mobile:
    m=re.search(r'\.'+re.escape(c)+r'\{([^}]*)\}',css)
    require(bool(m),f'missing CSS for {c}')
    if not m: continue
    body=m.group(1)
    wm=re.search(r'width:([0-9.]+)%',body); hm=re.search(r'height:([0-9.]+)%',body)
    require(bool(wm and hm),f'{c} missing percentage width/height')
    if wm and hm:
        w=390*float(wm.group(1))/100; h=1152*float(hm.group(1))/100
        require(w>=44 and h>=44, f'{c} touch target too small: {w:.1f}x{h:.1f}px')

warnings.append('PT/EN/ES visual selectors are present in the authority image; translated interactive variants remain gated until a separate approved language authority exists.')
report={'contract':'BLACKGOLD_V24_SEMANTIC_HOTSPOT_GATE','pass':not errors,'hotspots':len(p.hits),'errors':errors,'warnings':warnings}
Path(a.report).parent.mkdir(parents=True,exist_ok=True)
Path(a.report).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
