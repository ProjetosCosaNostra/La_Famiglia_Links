# ============================================
# 💳 LA FAMIGLIA LINKS — Pagamentos (Stripe)
# Planos, Checkout, Portal do Cliente
# ============================================

import os
from urllib.parse import urljoin

from flask import Blueprint, render_template, request, jsonify, redirect
import stripe

payments_bp = Blueprint("payments_bp", __name__, template_folder="templates")

# -------- Stripe Keys (ENV) --------
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "")
STRIPE_BASIC_ID = os.getenv("STRIPE_BASIC_ID", "")
STRIPE_PRO_ID   = os.getenv("STRIPE_PRO_ID", "")
STRIPE_DON_ID   = os.getenv("STRIPE_DON_ID", "")

if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY


def _base_url():
    # Prioriza domínio configurado; fallback para o host atual
    return os.getenv("FAMIGLIA_URL") or request.host_url


# ============================================
# 🗂️ Planos (Página pública)
# ============================================
@payments_bp.route("/plans", methods=["GET"])
def plans():
    planos = [
        {
            "id": STRIPE_BASIC_ID,
            "slug": "basic",
            "titulo": "Iniciante",
            "preco": "R$ 19,90/mês",
            "features": [
                "Hub de links",
                "Banners IA (limitado)",
                "Suporte padrão"
            ],
        },
        {
            "id": STRIPE_PRO_ID,
            "slug": "pro",
            "titulo": "Profissional",
            "preco": "R$ 49,90/mês",
            "features": [
                "Tudo do Iniciante",
                "Vídeos curtos IA (15s)",
                "AutoPost básico"
            ],
            "destaque": True
        },
        {
            "id": STRIPE_DON_ID,
            "slug": "don",
            "titulo": "Don Premium",
            "preco": "R$ 99,90/mês",
            "features": [
                "Tudo do Profissional",
                "Scheduler completo (IA diária)",
                "Prioridade no suporte"
            ],
        },
    ]
    # Indica se as variáveis Stripe estão presentes
    stripe_ok = bool(STRIPE_API_KEY and any(p["id"] for p in planos))
    return render_template("payments_plans.html", planos=planos, stripe_ok=stripe_ok)


# ============================================
# 🧾 Checkout (cria sessão)
# ============================================
@payments_bp.route("/create_checkout_session", methods=["POST"])
def create_checkout_session():
    if not STRIPE_API_KEY:
        return jsonify({"ok": False, "error": "Stripe não configurado no servidor."}), 400

    data = request.get_json(silent=True) or request.form or {}
    price_id = data.get("price_id")
    customer_email = data.get("email")  # opcional (pré-preencher)

    if not price_id:
        return jsonify({"ok": False, "error": "price_id obrigatório"}), 400

    success_url = urljoin(_base_url(), "/business/payments/success?session_id={CHECKOUT_SESSION_ID}")
    cancel_url  = urljoin(_base_url(), "/business/payments/cancel")

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=customer_email or None,
            billing_address_collection="auto",
            automatic_tax={"enabled": False},
            allow_promotion_codes=True,
        )
        # Você pode retornar JSON (SPA) ou redirecionar (form tradicional)
        if request.is_json:
            return jsonify({"ok": True, "url": session.url})
        return redirect(session.url, code=303)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================
# ✅ Sucesso / ❌ Cancel
# ============================================
@payments_bp.route("/success", methods=["GET"])
def success():
    return render_template("payments_success.html")

@payments_bp.route("/cancel", methods=["GET"])
def cancel():
    return render_template("payments_cancel.html")


# ============================================
# 🔁 Portal do Cliente (gerir assinatura)
# ============================================
@payments_bp.route("/portal", methods=["GET"])
def portal():
    if not STRIPE_API_KEY:
        return jsonify({"ok": False, "error": "Stripe não configurado."}), 400

    return_url = urljoin(_base_url(), "/business/payments/plans")
    try:
        session = stripe.billing_portal.Session.create(
            return_url=return_url,
        )
        return redirect(session.url, code=303)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================
# 🧪 Status (debug)
# ============================================
@payments_bp.route("/status", methods=["GET"])
def status():
    return jsonify({
        "ok": True,
        "stripe_configured": bool(STRIPE_API_KEY),
        "basic_set": bool(STRIPE_BASIC_ID),
        "pro_set": bool(STRIPE_PRO_ID),
        "don_set": bool(STRIPE_DON_ID),
        "base_url": _base_url()
    })
