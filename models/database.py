import sqlite3
import os
import hashlib

# Caminho absoluto para o banco de dados
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'database.db')

# ============================================================
# 🔧 Função: abrir conexão reutilizável
# ============================================================
def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    return conn

# ============================================================
# 🔐 Função: gerar hash de senha (SHA256)
# ============================================================
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

# ============================================================
# 🧱 Função: inicializar banco e tabela users
# ============================================================
def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

# ============================================================
# 👑 Criar admin padrão (se não existir)
# ============================================================
def create_default_admin():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", ('admin',))
    if not cursor.fetchone():
        cursor.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            ('admin', hash_password('admin123'))
        )
        print("👑 Usuário admin criado com senha padrão 'admin123'")
    conn.commit()
    conn.close()

# ============================================================
# ➕ Função auxiliar: adicionar novos usuários
# ============================================================
def add_user(username: str, password: str):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (username, hash_password(password))
        )
        conn.commit()
        print(f"✅ Usuário '{username}' criado com sucesso.")
    except sqlite3.IntegrityError:
        print(f"⚠️ Usuário '{username}' já existe.")
    finally:
        conn.close()
