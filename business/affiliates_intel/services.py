import os, json, requests, urllib.parse

# ============================================================
# 🛒 Serviços de coleta (ML público + Amazon opcional)
# ============================================================

def _apply_affiliate(url: str) -> str:
    """
    Aplica parâmetros de afiliado quando possível.
    - Amazon: adiciona tag de afiliado se AMAZON_TAG estiver setada
    - Mercado Livre: pode anexar UTMs customizadas
    """
    if not url:
        return url
    # Amazon
    tag = os.getenv("AMAZON_TAG")
    if tag and "amazon." in url:
        # já tem ? ou não?
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}tag={urllib.parse.quote(tag)}"
    # Mercado Livre UTM opcional
    utm = os.getenv("ML_UTM", "")
    if utm and "mercadolivre.com" in url and utm not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}{utm}"
    return url

def search_mercado_livre(query: str, limit=10):
    """
    Usa endpoint público de busca do Mercado Livre (sem key).
    """
    q = urllib.parse.quote(query)
    url = f"https://api.mercadolibre.com/sites/MLB/search?q={q}&limit={limit}"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    data = r.json()
    items = []
    for it in data.get("results", []):
        items.append({
            "source": "mercado_livre",
            "external_id": it.get("id"),
            "title": it.get("title"),
            "price": it.get("price"),
            "currency": it.get("currency_id") or "BRL",
            "url": it.get("permalink"),
            "image": it.get("thumbnail") or "",
            "affiliate_url": _apply_affiliate(it.get("permalink") or ""),
            "raw_json": json.dumps(it, ensure_ascii=False)
        })
    return items

def generate_amazon_url(asin: str) -> str:
    """
    Gera URL de produto com tag de afiliado (sem chamar PA-API).
    Ex.: https://www.amazon.com/dp/ASIN/?tag=sua_tag
    """
    if not asin:
        return ""
    base = os.getenv("AMAZON_BASE", "https://www.amazon.com/dp")
    tag = os.getenv("AMAZON_TAG", "")
    url = f"{base}/{asin}"
    if tag:
        url += f"/?tag={urllib.parse.quote(tag)}"
    return url

def search_amazon_mock(query: str, limit=6):
    """
    Placeholder se você ainda não ativou a PA-API.
    Retorna alguns modelos com ASIN fictício (substitua depois).
    """
    base_img = os.getenv("AMAZON_PLACEHOLDER_IMG",
                         "https://m.media-amazon.com/images/I/61c-Placeholder.jpg")
    fake = []
    for i in range(1, limit+1):
        asin = f"B0FAKE{i:03d}"
        fake.append({
            "source": "amazon",
            "external_id": asin,
            "title": f"{query} — Edição {i}",
            "price": 199.90 + i,
            "currency": "BRL",
            "url": generate_amazon_url(asin),
            "image": base_img,
            "affiliate_url": generate_amazon_url(asin),
            "raw_json": json.dumps({"mock": True, "q": query, "asin": asin}, ensure_ascii=False)
        })
    return fake

def search_products(query: str, sources=("mercado_livre", "amazon"), limit=10):
    """
    Alta-nível: busca nas fontes solicitadas.
    """
    results = []
    if "mercado_livre" in sources:
        try:
            results += search_mercado_livre(query, limit=limit)
        except Exception as e:
            print(f"⚠️ ML search falhou: {e}")
    if "amazon" in sources:
        # enquanto PA-API não estiver ligada, usamos mock
        try:
            results += search_amazon_mock(query, limit=min(6, limit))
        except Exception as e:
            print(f"⚠️ Amazon mock falhou: {e}")
    return results

# ============================================================
# 🧠 IA de legenda (usa seu endpoint local existente)
# ============================================================
def gerar_legenda_ia(titulo: str, preco: float, fonte: str) -> str:
    """
    Legenda curta no tom La Famiglia. Pode evoluir para chamar /api/gerar_texto.
    """
    preco_txt = f"R$ {preco:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    frases = [
        "Nada é coincidência… é estratégia.",
        "Elegância não se compra. Se reconhece.",
        "Para quem entende de poder silencioso."
    ]
    slogan = frases[hash(titulo) % len(frases)]
    return (f"🎩 {titulo}\n"
            f"💰 {preco_txt}\n"
            f"📦 Fonte: {fonte}\n\n"
            f"{slogan}\n"
            f"⚜️ Entre para a Família.")
