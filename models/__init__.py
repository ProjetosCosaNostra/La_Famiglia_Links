import os
from .database import init_db, create_default_admin

def setup_models():
    """Inicializa o banco e cria o admin padrão, se necessário."""
    try:
        init_db()
        create_default_admin()
        print("✅ Banco de dados inicializado e admin criado (se não existia).")
    except Exception as e:
        print(f"⚠️ Erro ao inicializar banco de dados: {e}")

# Executa automaticamente ao importar models
setup_models()
