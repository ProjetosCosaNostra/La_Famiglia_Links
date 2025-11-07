# ============================================
# 📦 LA FAMIGLIA DATABASE — Estrutura Oficial
# ============================================
import os
import sqlite3
from werkzeug.security import generate_password_hash

DB_PATH = "data/database.db"

# ============================================
# 🔗 Conexão
# ============================================
def get_db_connection():
    """Abre conexão SQLite com retorno em dicionário (Row)."""
    os.makedirs("data", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ============================================
# 🧱 Inicialização do Banco de Dados
# ============================================
def init_db():
    """Cria ou atualiza todas as tabelas principais."""
    os.makedirs("data", exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    # === Usuários (Don, admins, etc.) ===
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # === Links principais ===
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        url TEXT NOT NULL,
        categoria TEXT DEFAULT 'geral',
        ativo INTEGER DEFAULT 1,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()
    print("✅ Banco de dados atualizado com tabela de links completa.")

# ============================================
# 👑 Criação automática do Don (Admin Principal)
# ============================================
def create_default_admin():
    """Garante que o Don exista para login inicial."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE username = ?", ("don",))
    user = cursor.fetchone()

    if not user:
        pwd_hash = generate_password_hash("famiglia123")
        cursor.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            ("don", pwd_hash, "admin"),
        )
        conn.commit()
        print("👑 Don criado com sucesso (usuário: don / senha: famiglia123)")
    else:
        print("✅ Don já existe no banco.")

    conn.close()

# ============================================
# 🔧 Funções auxiliares para Links
# ============================================
def listar_links():
    """Retorna todos os links ativos."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM links WHERE ativo = 1 ORDER BY criado_em DESC")
    links = cursor.fetchall()
    conn.close()
    return links

def adicionar_link(nome, url, categoria="geral"):
    """Adiciona um novo link ao banco."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO links (nome, url, categoria, ativo) VALUES (?, ?, ?, 1)",
        (nome, url, categoria),
    )
    conn.commit()
    conn.close()

def remover_link(link_id):
    """Remove um link existente."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()
