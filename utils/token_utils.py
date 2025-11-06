import os
import jwt
from datetime import datetime, timedelta
from flask import request, redirect, url_for, make_response, jsonify

# ============================================
# 🎩 Sistema de Tokens — La Famiglia Secure JWT
# ============================================

SECRET_KEY = os.getenv("JWT_SECRET", "LaFamigliaSecretKey2025")

# ============================================================
# 🔐 Criação de Token (válido por 4 horas)
# ============================================================
def gerar_token(usuario: str, duracao_horas=4):
    payload = {
        "usuario": usuario,
        "exp": datetime.utcnow() + timedelta(hours=duracao_horas),
        "iat": datetime.utcnow(),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    return token

# ============================================================
# 🔍 Validação de Token
# ============================================================
def validar_token():
    token = request.cookies.get("la_family_token")
    if not token:
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload.get("usuario")

    except jwt.ExpiredSignatureError:
        print("⚠️ Token expirado — redirecionando para /business/expired")
        return "EXPIRED"

    except jwt.InvalidTokenError:
        print("⚠️ Token inválido — redirecionando para login")
        return None

# ============================================================
# ⚙️ Decorator de proteção
# ============================================================
def require_token(view_func):
    def wrapper(*args, **kwargs):
        usuario = validar_token()

        if usuario is None:
            return redirect(url_for("auth_bp.login_form"))

        if usuario == "EXPIRED":
            resp = make_response(redirect(url_for("business_bp.session_expired")))
            resp.set_cookie("la_family_token", "", expires=0)
            return resp

        return view_func(*args, **kwargs)
    wrapper.__name__ = view_func.__name__
    return wrapper

# ============================================================
# 🔁 Renovação de Token
# ============================================================
def renovar_token(usuario: str):
    """Gera um novo token e substitui o cookie atual."""
    novo_token = gerar_token(usuario)
    resp = jsonify({"status": "ok", "msg": "Token renovado"})
    resp.set_cookie("la_family_token", novo_token, httponly=True, max_age=4*3600)
    return resp
