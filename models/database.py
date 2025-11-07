# ============================================
# 📦 LA FAMIGLIA DATABASE — Inicialização Segura
# ============================================
import os
import sqlite3
from werkzeug.security import generate_password_hash

DB_PATH = "data/database.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Cria as tabelas principais da aplicação."""
    os.makedirs("data", exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()
    print("✅ Banco de dados da Família inicializado.")

# ============================================
# 👑 Criar usuário padrão (Don)
# ============================================
def create_default_admin():
    """Garante que o Don (admin principal) exista."""
    os.makedirs("data", exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = 'don'")
    exists = cursor.fetchone()
    if not exists:
        pwd_hash = generate_password_hash("famiglia123")
        cursor.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            ("don", pwd_hash, "admin")
        )
        conn.commit()
        print("👑 Don criado com sucesso (usuário: don / senha: famiglia123)")
    else:
        print("✅ Don já existe no banco.")
    conn.close()
