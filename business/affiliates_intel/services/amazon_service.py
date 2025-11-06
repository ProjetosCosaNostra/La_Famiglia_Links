# ============================================
# 🎩 LA FAMIGLIA LINKS — AMAZON SERVICE
# Coleta de produtos afiliados em alta na Amazon
# ============================================

import requests
from bs4 import BeautifulSoup
import os

AMAZON_ASSOCIATE_TAG = os.getenv("AMAZON_ASSOCIATE_TAG", "cosanostra-20")
AMAZON_BASE_URL = "https://www.amazon.com.br"

def buscar_produtos_amazon(limite=10):
    """
    Busca produtos em alta na Amazon Brasil (categoria 'Mais Vendidos').
    Retorna lista de dicionários: titulo, preco, imagem, link, origem.
    """
    url = f"{AMAZON_BASE_URL}/gp/bestsellers"
    produtos = []

    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "html.parser")
        itens = soup.select(".p13n-sc-uncoverable-faceout")[:limite]

        for item in itens:
            titulo = (item.select_one(".p13n-sc-truncate") or {}).get_text(strip=True) if item.select_one(".p13n-sc-truncate") else "Produto Amazon"
            imagem = item.select_one("img")["src"] if item.select_one("img") else ""
            link_rel = item.select_one("a")["href"] if item.select_one("a") else ""
            link = f"{AMAZON_BASE_URL}{link_rel}?tag={AMAZON_ASSOCIATE_TAG}"
            preco_el = item.select_one(".p13n-sc-price")
            preco = 0.0
            if preco_el:
                try:
                    preco = float(preco_el.get_text(strip=True).replace("R$", "").replace(".", "").replace(",", "."))
                except:
                    preco = 0.0

            produtos.append({
                "titulo": titulo[:100],
                "preco": preco,
                "imagem": imagem,
                "link": link,
                "origem": "Amazon"
            })
        return produtos
    except Exception as e:
        print(f"⚠️ Erro ao buscar produtos na Amazon: {e}")
        return []
