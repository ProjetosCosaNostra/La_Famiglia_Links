# utils/helpers.py
import sqlite3
import os
import jwt
from functools import wraps
from flask import request, jsonify, current_app

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "familia.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Decorator para proteger rotas com JWT Bearer token
def token_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", None)
        if not header:
            return jsonify({"erro": "Token ausente"}), 401

        parts = header.split()
        if parts[0].lower() != "bearer" or len(parts) != 2:
            return jsonify({"erro": "Cabeçalho Authorization inválido"}), 401

        token = parts[1]
        secret = current_app.config.get("SECRET_KEY", "cosanostra_segredo_supremo")
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            # opcional: anexar user no request (não obrigatório)
            request.user = payload.get("user")
        except jwt.ExpiredSignatureError:
            return jsonify({"erro": "Token expirado"}), 401
        except Exception as e:
            return jsonify({"erro": "Token inválido", "detalhe": str(e)}), 401

        return fn(*args, **kwargs)
    return wrapper
