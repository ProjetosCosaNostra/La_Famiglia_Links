# ============================================
# 🎩 Cosa Nostra — Sistema de Autenticação JWT
# Autor: Felipe (O Capo da Criação)
# ============================================

from flask import Blueprint, request, jsonify
import jwt
import datetime
import bcrypt
import sqlite3
from utils.helpers import get_db_connection

SECRET_KEY = "LaFamigliaCosaNostra2025"  # ⚠️ Troque por algo único em produção

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


# 🧱 Cria a tabela de usuários, se não existir
def init_user_table():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)
    conn.commit()

    # Cria um usuário padrão (admin)
    cursor.execute("SELECT * FROM users WHERE username = ?", ("admin",))
    if not cursor.fetchone():
        hashed = bcrypt.hashpw("famiglia2025".encode('utf-8'), bcrypt.gensalt())
        cursor.execute("INSERT INTO users (username, password) VALUES (?, ?)", ("admin", hashed))
        conn.commit()
    conn.close()


# 🚪 Rota de login
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    if not user or not bcrypt.checkpw(password.encode('utf-8'), user["password"]):
        return jsonify({"error": "Usuário ou senha inválidos"}), 401

    token = jwt.encode({
        "user": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, SECRET_KEY, algorithm="HS256")

    return jsonify({"token": token})


# 🧱 Middleware para verificar o token
def token_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            token = request.headers["Authorization"].split(" ")[1]

        if not token:
            return jsonify({"error": "Token ausente"}), 401

        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data["user"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expirado"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Token inválido"}), 401

        return f(current_user, *args, **kwargs)
    return decorated
