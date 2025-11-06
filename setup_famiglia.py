# setup_famiglia.py
# ⚜️ La Famiglia Links — Setup de inicialização
import os
import sys
import json
import sqlite3
from pathlib import Path
from datetime import datetime

# Preferimos funções do projeto, se existirem
INIT_OK = False
ADMIN_OK = False
DB_PATH = Path("data/database.db")

def _print_header():
    print("\n" + "="*72)
    print("🎩 LA FAMIGLIA LINKS — SETUP INICIAL")
    print("="*72 + "\n")

def _safe_import_init_db():
    global INIT_OK
    try:
        from models.database import init_db  # seu init oficial
        init_db()
        INIT_OK = True
        print("✅ Banco de dados inicializado com sucesso via models.database.init_db()")
    except Exception as e:
        print(f"⚠️ Não foi possível usar init_db oficial: {e}")
        # fallback mínimo: garantir arquivo sqlite
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not DB_PATH.exists():
            sqlite3.connect(DB_PATH).close()
            print("✅ Banco SQLite criado (fallback): data/database.db")
        else:
            print("ℹ️ Banco SQLite já existe: data/database.db")

def _ensure_admin_default():
    """
    Garante que exista um usuário admin (admin/admin123) na tabela `users`.
    Estrutura esperada mínima: id, username, password_hash, role.
    """
    global ADMIN_OK
    try:
        import sqlite3
        from werkzeug.security import generate_password_hash
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        # Cria tabela mínima se não existir (fallback seguro)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password_hash TEXT,
                role TEXT DEFAULT 'admin',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Verifica se já existe admin
        cur.execute("SELECT id FROM users WHERE username = ?", ("admin",))
        row = cur.fetchone()
        if row:
            ADMIN_OK = True
            print("👑 Usuário admin já existe.")
        else:
            pwd_hash = generate_password_hash("admin123")
            cur.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                ("admin", pwd_hash, "admin"),
            )
            conn.commit()
            ADMIN_OK = True
            print("👑 Usuário admin criado com senha padrão 'admin123'.")
        conn.close()
    except Exception as e:
        print(f"❌ Falha ao garantir admin: {e}")

def _check_env():
    required = [
        "FLASK_ENV",
        "PORT",
        "HUGGINGFACE_API_KEY",        # IA
        # Afiliados (opcionais, mas recomendados)
        "AMAZON_PARTNER_ID",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "ML_APP_ID",
        "ML_SECRET",
        # SaaS/Pagamentos (opcionais, mas recomendados)
        "STRIPE_PUBLIC_KEY",
        "STRIPE_SECRET_KEY",
    ]
    status = {}
    for key in required:
        val = os.getenv(key)
        status[key] = "✅ definido" if val else "⚠️ ausente"
    return status

def _write_report(env_status):
    report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "database_path": str(DB_PATH),
        "init_db_ok": INIT_OK,
        "admin_ok": ADMIN_OK,
        "env_check": env_status,
    }
    Path("logs").mkdir(exist_ok=True, parents=True)
    out = Path("logs/setup_report.json")
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n📝 Relatório salvo em: {out.resolve()}")
    print(json.dumps(report, indent=2, ensure_ascii=False))

def main():
    _print_header()
    _safe_import_init_db()
    _ensure_admin_default()
    env_status = _check_env()
    _write_report(env_status)
    print("\n⚜️ Setup finalizado.\n")

if __name__ == "__main__":
    sys.exit(main())
