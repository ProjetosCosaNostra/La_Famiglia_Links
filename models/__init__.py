import os
from .database import init_db, create_default_admin

def setup_models():
    """Inicializa o banco de dados e cria o admin padrão."""
    try:
        init_db()
        create_default_admin()
        print("✅ Banco de dados pronto e admin disponível.")
    except Exception as e:
        print(f"⚠️ Erro ao inicializar o banco de dados: {e}")

# Inicializa automaticamente ao importar o módulo
setup_models()
