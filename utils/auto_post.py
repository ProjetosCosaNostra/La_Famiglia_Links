# ==============================================
# 🎩 Cosa Nostra - AutoPost MVP
# Autor: Felipe (O Capo da Criação)
# Finalidade: Gerar posts automáticos com tendências + produtos afiliados
# ==============================================

import requests
import random
import datetime
import sqlite3
from pathlib import Path

# Caminho do banco
DB_PATH = Path(__file__).resolve().parents[1] / "famiglia.db"

# ----------------------------------------------
# 🔍 ETAPA 1 - Buscar tendências da web
# ----------------------------------------------
def buscar_tendencias():
    try:
        # Google Trends RSS (tópicos do momento)
        url = "https://trends.google.com/trending/rss?geo=BR"
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            titles = [line.split("<title>")[1].split("</title>")[0]
                      for line in response.text.splitlines()
                      if "<title>" in line]
            return titles[2:10]  # Ignora o título do feed
    except Exception as e:
        print(f"⚠️ Erro ao buscar tendências: {e}")
    return ["IA Generativa", "Tecnologia Futurista", "Cultura Pop", "Cinema", "Produtos Inteligentes"]

# ----------------------------------------------
# 🛒 ETAPA 2 - Selecionar produto afiliado
# ----------------------------------------------
def escolher_produto():
    produtos = [
        {
            "nome": "Luminária RGB Touch Inteligente",
            "link": "https://amzn.to/4h0gnbW",
            "imagem": "https://m.media-amazon.com/images/I/61O6nQ3P9-L._AC_SL1500_.jpg"
        },
        {
            "nome": "Headset Gamer com RGB",
            "link": "https://amzn.to/4h0gnbW",
            "imagem": "https://m.media-amazon.com/images/I/61sN4LqFZTL._AC_SL1500_.jpg"
        },
        {
            "nome": "Suporte de Celular Retrô",
            "link": "https://amzn.to/4h0gnbW",
            "imagem": "https://m.media-amazon.com/images/I/61oGZbJ3zRL._AC_SL1500_.jpg"
        },
        {
            "nome": "Caixa de Som Bluetooth Clássica",
            "link": "https://amzn.to/4h0gnbW",
            "imagem": "https://m.media-amazon.com/images/I/71uZfw8VqQL._AC_SL1500_.jpg"
        }
    ]
    return random.choice(produtos)

# ----------------------------------------------
# 🧠 ETAPA 3 - Gerar conteúdo do post
# ----------------------------------------------
def gerar_post():
    tendencias = buscar_tendencias()
    topico = random.choice(tendencias)
    produto = escolher_produto()

    titulo = f"{topico}: o toque de estilo da Família 🎩"
    descricao = (
        f"No mundo das ideias e da honra, cada detalhe importa.\n"
        f"A {produto['nome']} é o símbolo da modernidade com respeito às tradições.\n"
        f"Disponível no link da Família: {produto['link']}"
    )
    imagem = produto["imagem"]
    data = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")

    return {
        "titulo": titulo,
        "descricao": descricao,
        "imagem": imagem,
        "link": produto["link"],
        "data": data
    }

# ----------------------------------------------
# 💾 ETAPA 4 - Salvar no banco de dados
# ----------------------------------------------
def salvar_post(post):
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS posts_auto (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT,
                descricao TEXT,
                imagem TEXT,
                link TEXT,
                data TEXT
            )
        """)
        cur.execute("""
            INSERT INTO posts_auto (titulo, descricao, imagem, link, data)
            VALUES (?, ?, ?, ?, ?)
        """, (post["titulo"], post["descricao"], post["imagem"], post["link"], post["data"]))
        conn.commit()
        conn.close()
        print(f"✅ Post salvo: {post['titulo']}")
    except Exception as e:
        print(f"❌ Erro ao salvar post: {e}")

# ----------------------------------------------
# 🚀 EXECUÇÃO PRINCIPAL
# ----------------------------------------------
if __name__ == "__main__":
    print("🎩 Gerando post automático da Família...")
    post = gerar_post()
    salvar_post(post)
    print(f"🧱 Conteúdo gerado: {post['titulo']}\n🖼️ {post['imagem']}\n🔗 {post['link']}")
