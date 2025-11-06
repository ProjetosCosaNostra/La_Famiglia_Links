import random
from datetime import datetime
from .models import inserir_tendencia

# Simula categorias e fontes
CATEGORIAS = ["Tecnologia", "Moda", "Casa", "Beleza", "Esporte"]
FONTES = ["Amazon", "Mercado Livre", "Google Trends"]

def coletar_tendencias():
    """Simula a coleta de tendências de produtos populares."""
    produtos = [
        "Relógio Inteligente", "Fone Bluetooth", "Jaqueta de Couro",
        "Tênis Esportivo", "Smart TV 50\"", "Notebook Gamer",
        "Perfume Masculino", "Cadeira Gamer", "Air Fryer", "Drone Compacto"
    ]

    for nome in random.sample(produtos, k=5):
        inserir_tendencia(
            nome=nome,
            fonte=random.choice(FONTES),
            categoria=random.choice(CATEGORIAS),
            popularidade=random.randint(70, 100)
        )
    print(f"[{datetime.now()}] ✅ Tendências coletadas e registradas no banco.")
