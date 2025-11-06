import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "database.db")

def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_tendencias_table():
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS produtos_tendencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            fonte TEXT,
            categoria TEXT,
            popularidade INTEGER,
            descricao_ia TEXT,
            imagem_url TEXT,
            criado_em TEXT
        )
    """)
    conn.commit()
    conn.close()

def inserir_tendencia(nome, fonte, categoria, popularidade, descricao_ia="", imagem_url=""):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO produtos_tendencias
        (nome, fonte, categoria, popularidade, descricao_ia, imagem_url, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (nome, fonte, categoria, popularidade, descricao_ia, imagem_url, datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()

def listar_tendencias(limit=30):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT nome, fonte, categoria, popularidade, descricao_ia, imagem_url, criado_em
        FROM produtos_tendencias ORDER BY popularidade DESC LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    conn.close()
    return [
        {
            "nome": r[0],
            "fonte": r[1],
            "categoria": r[2],
            "popularidade": r[3],
            "descricao_ia": r[4],
            "imagem_url": r[5],
            "criado_em": r[6]
        } for r in rows
    ]

# Garante a criação da tabela
init_tendencias_table()
