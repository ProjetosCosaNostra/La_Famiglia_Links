# ============================================
# 🎩 LA FAMIGLIA LINKS — Autenticação Segura
# JWT + Sessão + Log de Acesso
# ============================================

import os
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

import jwt
from flask import (
    Blueprint, request, jsonify, make_response,
    redirect, url_for, render_template
)
from werkzeug.security import generate_password_hash, check_password_hash

# --------------------------------------------
# ⚙️ Configurações principais
# --------------------------------------------
auth_bp = Blueprint("auth_bp", __name__, template_folder="templates")
JWT_SECRET = os.getenv("JWT_SECRET", "famiglia_secret")
DB_PATH = Path("data/database.db")
COOKIE_NAME = "la_family_token"

# --------------------------------------------
# 🧱 Banco e tabelas básicas
# --------------------------------------------
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
    cur.execute("""
        CREATE TABLE IF NOT EXISTS admin_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT,
            acao TEXT,
            ip TEXT,
            navegador TEXT,
            data TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()

# --------------------------------------------
# 🔐 Funções auxiliares
# --------------------------------------------
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

def generate_token(payload: dict, hours=8):
    payload["exp"] = datetime.utcnow() + timedelta(hours=hours)
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_token(token: str):
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])

def _registrar_log(usuario, acao):
    """Insere registro no log de atividades administrativas."""
    ip = request.remote_addr or "?"
    navegador = request.user_agent.string[:150] if request.user_agent else "?"
    try:
        conn = _conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO admin_logs (usuario, acao, ip, navegador, data) VALUES (?, ?, ?, ?, ?)",
            (usuario, acao, ip, navegador, datetime.utcnow().isoformat()),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"⚠️ Falha ao registrar log: {e}")

# --------------------------------------------
# 🧱 Decorador de proteção JWT
# --------------------------------------------
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

# --------------------------------------------
# 🧩 ROTAS
# --------------------------------------------
@auth_bp.route("/auth/login", methods=["GET"])
def login_form():
    return render_template("admin_login.html")

@auth_bp.route("/auth/login", methods=["POST"])
def login_post():
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
        _registrar_log(username or "?", "LOGIN_FALHOU")
        return make_response("Usuário ou senha inválidos", 401)

    token = generate_token({"sub": username, "role": row[2]})
    resp = make_response(redirect("/business/view"))
    resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Lax", max_age=60*60*8)
    _registrar_log(username, "LOGIN")
    return resp

@auth_bp.route("/auth/logout", methods=["GET"])
@require_token
def logout():
    token_data = request.cookies.get(COOKIE_NAME)
    try:
        usuario = decode_token(token_data).get("sub", "?")
    except Exception:
        usuario = "?"
    _registrar_log(usuario, "LOGOUT")
    resp = make_response(redirect(url_for("auth_bp.login_form")))
    resp.set_cookie(COOKIE_NAME, "", expires=0)
    return resp

@auth_bp.route("/auth/create_user", methods=["POST"])
@require_token
def create_user_route():
    data = request.get_json() or {}
    if not all([data.get("username"), data.get("password")]):
        return jsonify({"ok": False, "error": "username/password obrigatórios"}), 400
    ok = create_user(data["username"], data["password"], data.get("role", "admin"))
    _registrar_log(request.cookies.get("username", "?"), "CREATE_USER")
    return jsonify({"ok": ok})

@auth_bp.route("/auth/delete_user", methods=["POST"])
@require_token
def delete_user_route():
    data = request.get_json() or {}
    if not data.get("username"):
        return jsonify({"ok": False, "error": "username obrigatório"}), 400
    ok = delete_user(data["username"])
    _registrar_log(request.cookies.get("username", "?"), "DELETE_USER")
    return jsonify({"ok": ok})

@auth_bp.route("/auth/protected")
@require_token
def protected():
    return "Área restrita da Família."
