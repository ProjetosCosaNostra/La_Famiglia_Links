# models/database.py
import sqlite3
import os
import bcrypt

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "familia.db")

def get_db_path():
    os.makedirs(DATA_DIR, exist_ok=True)
    return DB_PATH

def init_db():
    db = get_db_path()
    conn = sqlite3.connect(db)
    c = conn.cursor()

    # tabela links
    c.execute("""
        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            url TEXT NOT NULL,
            descricao TEXT,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # tabela usuarios (admin)
    c.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # tabela acessos / analytics
    c.execute("""
        CREATE TABLE IF NOT EXISTS acessos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link_id INTEGER,
            origem TEXT,
            data_acesso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(link_id) REFERENCES links(id)
        )
    """)

    conn.commit()
    conn.close()

def create_default_admin(app=None, username="admin", password="famiglia2025"):
    """
    Cria um usuário admin com senha segura (bcrypt) caso não exista.
    """
    db = get_db_path()
    conn = sqlite3.connect(db)
    c = conn.cursor()
    c.execute("SELECT id FROM usuarios WHERE username = ?", (username,))
    row = c.fetchone()
    if row:
        conn.close()
        return False

    # hash da senha
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
    c.execute("INSERT INTO usuarios (username, password) VALUES (?, ?)", (username, hashed))
    conn.commit()
    conn.close()
    print(f"👑 Usuário padrão criado: {username} / (senha oculta).")
    return True
