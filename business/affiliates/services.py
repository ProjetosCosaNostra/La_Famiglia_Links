import random

def buscar_produtos_mercadolivre():
    """Simula a busca de produtos populares do Mercado Livre."""
    produtos = [
        {"nome": "Relógio Invicta Dourado", "preco": 899.90, "link": "https://mercadolivre.com/invicta123", "imagem": "https://picsum.photos/300?1"},
        {"nome": "Canivete Tático Militar", "preco": 149.50, "link": "https://mercadolivre.com/canivete001", "imagem": "https://picsum.photos/300?2"},
        {"nome": "Carteira de Couro Premium", "preco": 179.00, "link": "https://mercadolivre.com/carteira10", "imagem": "https://picsum.photos/300?3"},
    ]
    return random.sample(produtos, k=2)


def buscar_produtos_amazon():
    """Simula a busca de produtos em alta na Amazon."""
    produtos = [
        {"nome": "Óculos Aviador Lux", "preco": 299.99, "link": "https://amazon.com/oculos123", "imagem": "https://picsum.photos/300?4"},
        {"nome": "Perfume Italiano Uomo", "preco": 499.00, "link": "https://amazon.com/perfumeuomo", "imagem": "https://picsum.photos/300?5"},
        {"nome": "Pulseira de Aço Negra", "preco": 229.00, "link": "https://amazon.com/pulseira22", "imagem": "https://picsum.photos/300?6"},
    ]
    return random.sample(produtos, k=2)
