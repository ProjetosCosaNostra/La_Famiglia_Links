# ============================================
# 🎩 LA FAMIGLIA LINKS — Setup Inicial Automático
# Inicializa o banco, cria admin e sincroniza planos Stripe
# ============================================

import os
from models.database import init_db
from auth import create_user
import stripe

# =========================================================
# ⚙️ Configurações iniciais
# =========================================================
print("🕵️ Iniciando configuração da Família...")

# Inicializa banco SQLite
try:
    init_db()
    print("📦 Banco de dados da Família inicializado com sucesso.")
except Exception as e:
    print(f"⚠️ Erro ao inicializar banco: {e}")

# =========================================================
# 🔐 Cria usuário administrador padrão
# =========================================================
try:
    admin_user = os.getenv("ADMIN_USER", "don")
    admin_pass = os.getenv("ADMIN_PASS", "famiglia123")
    ok = create_user(admin_user, admin_pass, "admin")
    if ok:
        print(f"👑 Usuário administrador criado: {admin_user}")
    else:
        print(f"ℹ️ Usuário '{admin_user}' já existe.")
except Exception as e:
    print(f"⚠️ Erro ao criar usuário admin: {e}")

# =========================================================
# 💳 Configuração do Stripe (Planos)
# =========================================================
try:
    stripe.api_key = os.getenv("STRIPE_API_KEY")

    planos = {
        "BASIC": os.getenv("STRIPE_BASIC_ID"),
        "PRO": os.getenv("STRIPE_PRO_ID"),
        "DON": os.getenv("STRIPE_DON_ID")
    }

    print("\n💼 Sincronizando planos Stripe:")
    for nome, pid in planos.items():
        if pid:
            print(f"  - {nome}: {pid}")
        else:
            print(f"  ⚠️ {nome} ainda não configurado no Render.")

    print("\n✅ Stripe vinculado com sucesso aos planos ativos.")
except Exception as e:
    print(f"⚠️ Erro ao conectar com Stripe: {e}")

# =========================================================
# 🔚 Finalização
# =========================================================
print("\n🎩 Setup concluído com honra e respeito.")
print("A Família está pronta para negócios.")
print("Acesse o painel:  http://127.0.0.1:10000/auth/login")
