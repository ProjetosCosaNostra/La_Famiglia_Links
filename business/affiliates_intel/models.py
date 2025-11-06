import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path("data/database.db")

def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DB_PATH)

def ensure_tables():
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS products_intel (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT,
            external_id TEXT,       -- ASIN ou ML_ID
            title TEXT,
            price REAL,
            currency TEXT,
            url TEXT,
            image TEXT,
            affiliate_url TEXT,     -- sua tag/afiliado aplicada
            raw_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS posts_generated (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            platform TEXT,          -- instagram, tiktok, kwai, youtube
            caption TEXT,
            image_path TEXT,
            video_path TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(product_id) REFERENCES products_intel(id)
        );
    """)
    conn.commit()
    conn.close()

def insert_product(p):
    ensure_tables()
    conn = _conn()
    cur = conn.cursor()
    # Evita duplicata por source+external_id ou por url
    cur.execute("""
        SELECT id FROM products_intel
        WHERE (source=? AND external_id=?) OR url=?;
    """, (p.get("source"), p.get("external_id"), p.get("url")))
    row = cur.fetchone()
    if row:
        conn.close()
        return row[0]

    cur.execute("""
        INSERT INTO products_intel (source, external_id, title, price, currency, url, image, affiliate_url, raw_json)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (
        p.get("source"), p.get("external_id"), p.get("title"),
        p.get("price"), p.get("currency"), p.get("url"),
        p.get("image"), p.get("affiliate_url"), p.get("raw_json")
    ))
    conn.commit()
    pid = cur.lastrowid
    conn.close()
    return pid

def list_products(limit=50):
    ensure_tables()
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, source, external_id, title, price, currency, url, image, affiliate_url, created_at
        FROM products_intel
        ORDER BY id DESC
        LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    conn.close()
    return rows

def insert_post(product_id, platform, caption, image_path=None, video_path=None):
    ensure_tables()
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO posts_generated (product_id, platform, caption, image_path, video_path)
        VALUES (?,?,?,?,?)
    """, (product_id, platform, caption, image_path, video_path))
    conn.commit()
    pid = cur.lastrowid
    conn.close()
    return pid

def recent_posts(limit=20):
    ensure_tables()
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.id, pr.title, p.platform, p.caption, p.image_path, p.video_path, p.created_at
        FROM posts_generated p
        JOIN products_intel pr ON pr.id = p.product_id
        ORDER BY p.id DESC
        LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    conn.close()
    return rows
