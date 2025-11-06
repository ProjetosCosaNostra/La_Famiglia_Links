# ============================================
# 🎩 LA FAMIGLIA LINKS — MERCADO LIVRE SERVICE
# Coleta de produtos afiliados em alta no Mercado Livre
# ============================================

import requests

ML_BASE_URL = "https://api.mercadolibre.com"

def buscar_produtos_mercadolivre(limite=10):
    """
    Busca produtos mais populares no Mercado Livre Brasil.
    Retorna lista de dicionários: titulo, preco, imagem, link, origem.
    """
    produtos = []
    try:
        url = f"{ML_BASE_URL}/sites/MLB/search?q=eletronicos&sort=price_desc&limit={limite}"
        resp = requests.get(url)
        data = resp.json()

        for item in data.get("results", [])[:limite]:
            produtos.append({
                "titulo": item.get("title", "Produto Mercado Livre")[:100],
                "preco": item.get("price", 0.0),
                "imagem": item.get("thumbnail", ""),
                "link": item.get("permalink", ""),
                "origem": "Mercado Livre"
            })
        return produtos
    except Exception as e:
        print(f"⚠️ Erro ao buscar produtos no Mercado Livre: {e}")
        return []
