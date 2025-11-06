import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "database.db")

def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_payments_tables():
    conn = _conn()
    cur = conn.cursor()

    # Usuários e planos
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios_premium (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE,
            plano TEXT DEFAULT 'free',
            ativo INTEGER DEFAULT 1,
            criado_em TEXT
        )
    """)

    # Histórico de pagamentos
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            valor REAL,
            metodo TEXT,
            status TEXT,
            criado_em TEXT,
            FOREIGN KEY(usuario_id) REFERENCES usuarios_premium(id)
        )
    """)
    conn.commit()
    conn.close()

def criar_usuario(nome, email, plano="free"):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT OR IGNORE INTO usuarios_premium (nome, email, plano, criado_em)
        VALUES (?, ?, ?, ?)
    """, (nome, email, plano, datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()

def listar_usuarios():
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT nome, email, plano, ativo, criado_em FROM usuarios_premium")
    data = cur.fetchall()
    conn.close()
    return [
        {"nome": d[0], "email": d[1], "plano": d[2], "ativo": bool(d[3]), "criado_em": d[4]}
        for d in data
    ]

init_payments_tables()
