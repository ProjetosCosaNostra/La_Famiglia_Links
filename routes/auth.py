from flask import Blueprint, request, render_template, redirect, url_for, make_response, jsonify
from utils.jwt_utils import create_token, decode_token
from models.database import get_connection, hash_password

auth_bp = Blueprint("auth", __name__, url_prefix="")

# Helper para checar credenciais (consulta DB)
def check_credentials(username: str, password: str) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT password FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return False
    stored_hash = row[0]
    return stored_hash == hash_password(password)

# Rota que exibe formulário simples de login (HTML)
@auth_bp.route("/admin/login", methods=["GET"])
def admin_login_form():
    return render_template("admin_login.html")

# Rota que recebe form e redireciona para /admin com cookie JWT
@auth_bp.route("/admin/login", methods=["POST"])
def admin_login_post():
    username = request.form.get("username")
    password = request.form.get("password")
    if not username or not password:
        return redirect(url_for("auth.admin_login_form"))
    if check_credentials(username, password):
        token = create_token({"sub": username})
        resp = make_response(redirect(url_for("auth.admin_panel")))
        resp.set_cookie("la_family_token", token, httponly=True, samesite="Lax")
        return resp
    return redirect(url_for("auth.admin_login_form"))

# API endpoint para obter token via JSON (useful for apps)
@auth_bp.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "missing credentials"}), 400
    if check_credentials(username, password):
        token = create_token({"sub": username})
        return jsonify({"token": token})
    return jsonify({"error": "invalid credentials"}), 401

# Decorator simples para proteger rotas
def require_token(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # Try cookie then Authorization header
        token = request.cookies.get("la_family_token")
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1]
        if not token:
            return redirect(url_for("auth.admin_login_form"))
        payload = decode_token(token)
        if not payload:
            return redirect(url_for("auth.admin_login_form"))
        # attach user info to request context if you want
        return fn(*args, **kwargs)
    return wrapper

# Admin panel (protected)
@auth_bp.route("/admin", methods=["GET"])
@require_token
def admin_panel():
    # Here you can render real admin controls (list users, add links, etc)
    return render_template("admin.html")
