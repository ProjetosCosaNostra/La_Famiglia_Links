import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "la_famiglia.db")

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH)

def init_db():
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

def create_default_admin():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", ("admin",))
    if not cursor.fetchone():
        cursor.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            ("admin", "admin123")
        )
        conn.commit()
    conn.close()
