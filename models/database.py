import os
import sqlite3
import hashlib

# Caminho do banco
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "la_famiglia.db")

def get_connection():
    """Retorna conexão SQLite."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH)

def init_db():
    """Cria tabelas se não existirem."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
    """)
    conn.commit()
    conn.close()

def hash_password(password: str) -> str:
    """Gera hash SHA256 para senha."""
    return hashlib.sha256(password.encode()).hexdigest()

def create_default_admin():
    """Cria o usuário admin padrão (caso não exista)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", ("admin",))
    if not cursor.fetchone():
        cursor.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            ("admin", hash_password("admin123"))
        )
        conn.commit()
        print("👤 Usuário admin criado com senha padrão: admin123")
    conn.close()
