# ============================================
# 🎩 LA FAMIGLIA LINKS — Módulo de Banco de Dados
# Configuração central do SQLite (Render + Local)
# ============================================

import os
import sqlite3

# Caminho absoluto do banco de dados
# Em Render, o /app é o diretório de trabalho do container
DB_PATH = os.path.join(os.getcwd(), "data", "database.db")


# ============================================================
# 🧱 Função principal — Inicializa o banco e as tabelas básicas
# ============================================================
def init_db():
    """Cria o banco e as tabelas essenciais se não existirem."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # ---------------------------
    # 🧑‍💼 Tabela de usuários
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'admin',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ---------------------------
    # 🔗 Tabela de links
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            url TEXT NOT NULL,
            ativo INTEGER DEFAULT 1
        )
    """)

    # ---------------------------
    # 📊 Logs administrativos
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS admin_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT,
            acao TEXT,
            ip TEXT,
            navegador TEXT,
            data DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ---------------------------
    # 💼 Registros de afiliados
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS afiliados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto TEXT,
            preco REAL,
            origem TEXT,
            url TEXT,
            data DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()
    print("✅ Banco de dados da Família inicializado com sucesso.")


# ============================================================
# ⚙️ Função utilitária — Conexão direta (para queries rápidas)
# ============================================================
def get_connection():
    """Retorna uma conexão ativa com o banco."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH)


# ============================================================
# 🧪 Execução direta (modo debug)
# ============================================================
if __name__ == "__main__":
    print("🔧 Inicializando banco manualmente...")
    init_db()
    print(f"📁 Banco criado em: {DB_PATH}")
