# ============================================
# 🔐 LA FAMIGLIA LINKS — Autenticação e Sessão
# Sistema de Login Seguro para o Don e Aliados
# ============================================

import os
import sqlite3
from datetime import datetime, timedelta
from functools import wraps

import jwt
from flask import (
    Blueprint, request, jsonify, make_response,
    redirect, url_for, render_template
)
from werkzeug.security import generate_password_hash, check_password_hash
from pathlib import Path

# ============================================
# 🔹 Configuração e Constantes
# ============================================
auth_bp = Blueprint("auth_bp", __name__, template_folder="templates")
JWT_SECRET = os.getenv("JWT_SECRET", "famiglia_secret")
DB_PATH = Path("data/database.db")
COOKIE_NAME = "la_family_token"

# ============================================
# 🧱 Funções Internas do Banco
# ============================================
def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DB_PATH)

def _ensure_users_table():
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'admin',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()

# ============================================
# 👑 Criação e Gerenciamento de Usuários
# ============================================
def create_user(username: str, password: str, role: str = "admin"):
    _ensure_users_table()
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE username=?", (username,))
    if cur.fetchone():
        conn.close()
        return False
    cur.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), role),
    )
    conn.commit()
    conn.close()
    return True

def delete_user(username: str):
    _ensure_users_table()
    conn = _conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE username=?", (username,))
    conn.commit()
    conn.close()
    return True

# ============================================
# 🔑 Geração e Validação de Tokens
# ============================================
def generate_token(payload: dict, hours=8):
    exp = datetime.utcnow() + timedelta(hours=hours)
    payload["exp"] = exp
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_token(token: str):
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])

def require_token(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = request.cookies.get(COOKIE_NAME) or request.headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            return redirect(url_for("auth_bp.login_form"))
        try:
            decode_token(token)
        except Exception:
            return redirect(url_for("auth_bp.login_form"))
        return f(*args, **kwargs)
    return wrapper

# ============================================
# 🧭 ROTAS PRINCIPAIS DE LOGIN / LOGOUT
# ============================================
@auth_bp.route("/auth/login", methods=["GET"])
def login_form():
    """Renderiza o formulário de login."""
    try:
        return render_template("admin_login.html")
    except Exception as e:
        return f"<h1>Erro ao carregar template: {e}</h1>", 500

@auth_bp.route("/auth/login", methods=["POST"])
def login_post():
    """Valida credenciais e gera token JWT."""
    _ensure_users_table()
    data = request.form if request.form else request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return make_response("Credenciais ausentes", 400)

    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash, role FROM users WHERE username=?", (username,))
    row = cur.fetchone()
    conn.close()

    if not row or not check_password_hash(row[1], password):
        return make_response("Usuário ou senha inválidos", 401)

    token = generate_token({"sub": username, "role": row[2]})
    resp = make_response(redirect("/business/view"))
    resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Lax", max_age=60*60*8)
    return resp

@auth_bp.route("/auth/logout", methods=["GET"])
@require_token
def logout():
    """Efetua logout e limpa cookie."""
    resp = make_response(redirect(url_for("auth_bp.login_form")))
    resp.set_cookie(COOKIE_NAME, "", expires=0)
    return resp

# ============================================
# 👨‍💻 Rotas administrativas (CRUD usuários)
# ============================================
@auth_bp.route("/auth/create_user", methods=["POST"])
@require_token
def create_user_route():
    """Cria novo usuário."""
    data = request.get_json() or {}
    if not all([data.get("username"), data.get("password")]):
        return jsonify({"ok": False, "error": "username/password obrigatórios"}), 400
    ok = create_user(data["username"], data["password"], data.get("role", "admin"))
    return jsonify({"ok": ok})

@auth_bp.route("/auth/delete_user", methods=["POST"])
@require_token
def delete_user_route():
    """Remove usuário existente."""
    data = request.get_json() or {}
    if not data.get("username"):
        return jsonify({"ok": False, "error": "username obrigatório"}), 400
    ok = delete_user(data["username"])
    return jsonify({"ok": ok})

# ============================================
# 🔒 Página protegida de teste
# ============================================
@auth_bp.route("/auth/protected")
@require_token
def protected():
    """Verificação de proteção JWT."""
    return "🎩 Área restrita da Família. Bem-vindo, Don."
