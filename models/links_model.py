# ============================================
# 🔗 LA FAMIGLIA LINKS MODEL
# CRUD completo para gerenciar links do painel
# ============================================
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'database.db')

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_links_table():
    """Cria a tabela de links, se não existir."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            url TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

def listar_links():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, nome, url FROM links ORDER BY id DESC")
    data = [{"id": r[0], "nome": r[1], "url": r[2]} for r in cur.fetchall()]
    conn.close()
    return data

def adicionar_link(nome: str, url: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO links (nome, url) VALUES (?, ?)", (nome, url))
    conn.commit()
    conn.close()

def atualizar_link(link_id: int, nome: str, url: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE links SET nome = ?, url = ? WHERE id = ?", (nome, url, link_id))
    conn.commit()
    conn.close()

def excluir_link(link_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()
