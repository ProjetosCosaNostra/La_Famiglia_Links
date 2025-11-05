# ============================================
# 🕴️ LA FAMIGLIA AUTH SYSTEM
# Autenticação JWT + Painel Administrativo + Logout
# ============================================

from flask import Blueprint, request, render_template, redirect, url_for, make_response, jsonify
from utils.jwt_utils import create_token, decode_token
from models.database import get_connection, hash_password, add_user

auth_bp = Blueprint("auth_bp", __name__, url_prefix="/auth")

# --------------------------------------------
# 🧩 Helper — Verifica credenciais no banco
# --------------------------------------------
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

# --------------------------------------------
# 🔐 Login Web (HTML)
# --------------------------------------------
@auth_bp.route("/login", methods=["GET"])
def login_form():
    """Exibe o formulário de login (HTML)."""
    return render_template("admin_login.html")

@auth_bp.route("/login", methods=["POST"])
def login_post():
    """Recebe dados do formulário e cria cookie JWT."""
    username = request.form.get("username")
    password = request.form.get("password")
    if not username or not password:
        return redirect(url_for("auth_bp.login_form"))
    if check_credentials(username, password):
        token = create_token({"sub": username})
        resp = make_response(redirect(url_for("auth_bp.admin_panel")))
        resp.set_cookie("la_family_token", token, httponly=True, samesite="Lax")
        return resp
    return redirect(url_for("auth_bp.login_form"))

# --------------------------------------------
# 🧩 API Login (JSON)
# --------------------------------------------
@auth_bp.route("/api/login", methods=["POST"])
def api_login():
    """API para login via JSON (usada por apps)."""
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "missing credentials"}), 400
    if check_credentials(username, password):
        token = create_token({"sub": username})
        return jsonify({"token": token})
    return jsonify({"error": "invalid credentials"}), 401

# --------------------------------------------
# 🧠 Decorator — Protege rotas com JWT
# --------------------------------------------
def require_token(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = request.cookies.get("la_family_token")
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1]
        if not token:
            return redirect(url_for("auth_bp.login_form"))
        payload = decode_token(token)
        if not payload:
            return redirect(url_for("auth_bp.login_form"))
        return fn(*args, **kwargs)
    return wrapper

# --------------------------------------------
# 🧱 Painel Administrativo (HTML)
# --------------------------------------------
@auth_bp.route("/admin", methods=["GET"])
@require_token
def admin_panel():
    """Renderiza o painel administrativo principal."""
    return render_template("admin.html")

# ============================================
# 👥 ROTAS AUXILIARES — GERENCIAMENTO DE USUÁRIOS
# ============================================

@auth_bp.route("/api/users", methods=["GET"])
@require_token
def listar_usuarios():
    """Lista todos os usuários registrados."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, username FROM users")
    data = [{"id": r[0], "username": r[1]} for r in cur.fetchall()]
    conn.close()
    return jsonify(data)

@auth_bp.route("/api/users", methods=["POST"])
@require_token
def criar_usuario():
    """Cria um novo usuário via JSON."""
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"erro": "Campos obrigatórios: username e password."}), 400
    add_user(username, password)
    return jsonify({"sucesso": True, "mensagem": f"Usuário '{username}' criado."})

@auth_bp.route("/api/users/<int:user_id>", methods=["DELETE"])
@require_token
def excluir_usuario(user_id):
    """Remove um usuário existente pelo ID."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"sucesso": True, "mensagem": f"Usuário {user_id} removido."})

# ============================================
# 🚪 LOGOUT — Encerrar sessão
# ============================================

@auth_bp.route("/logout", methods=["GET"])
@require_token
def logout():
    """Remove o token e encerra a sessão do usuário."""
    resp = make_response(redirect(url_for("auth_bp.login_form")))
    resp.set_cookie("la_family_token", "", expires=0)
    return resp
