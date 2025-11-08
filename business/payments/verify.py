# business/payments/verify.py
# ============================================
# 🎩 La Famiglia Links — Stripe Verify (modo teste por padrão)
# Webhook + sincronização de assinaturas no banco
# ============================================

import os
import json
import sqlite3
from datetime import datetime
from flask import Blueprint, request, jsonify

payments_verify_bp = Blueprint("payments_verify_bp", __name__)

# --------------------------------------------
# 🔐 Config Stripe (modo TESTE por padrão)
# --------------------------------------------
try:
    import stripe
except Exception:  # stripe não instalado
    stripe = None

STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "")
STRIPE_BASIC_ID = os.getenv("STRIPE_BASIC_ID", "")
STRIPE_PRO_ID   = os.getenv("STRIPE_PRO_ID", "")
STRIPE_DON_ID   = os.getenv("STRIPE_DON_ID", "")

# Stripe Webhook secret (opcional; se não existir, aceita sem verificação de assinatura)
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# --------------------------------------------
# 🧱 Banco — conexão simples e segura
# --------------------------------------------
def _db_path():
    # Em Render/Linux, prefira /data; local: ./data
    base = os.getenv("DATABASE_DIR", "/data")
    if not os.path.isdir(base):
        base = "data"
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "database.db")

def _conn():
    return sqlite3.connect(_db_path(), check_same_thread=False)

def _ensure_tables():
    con = _conn()
    cur = con.cursor()
    # Tabela de usuários (garantia)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'admin',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # Tabela de assinaturas
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            plan TEXT,                    -- BASIC | PRO | DON
            status TEXT,                  -- active | trialing | canceled | past_due | incomplete | ...
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            current_period_end TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    con.commit()
    con.close()

_ensure_tables()

# --------------------------------------------
# 🗺️ Utilitários
# --------------------------------------------
def _plan_from_price(price_id: str) -> str:
    if not price_id:
        return "BASIC"
    if price_id == STRIPE_DON_ID:
        return "DON"
    if price_id == STRIPE_PRO_ID:
        return "PRO"
    if price_id == STRIPE_BASIC_ID:
        return "BASIC"
    # fallback
    return "BASIC"

def _upsert_subscription(username: str,
                         plan: str,
                         status: str,
                         stripe_customer_id: str,
                         stripe_subscription_id: str,
                         current_period_end: str):
    con = _conn()
    cur = con.cursor()
    cur.execute("""
        SELECT id FROM user_subscriptions
        WHERE username=?;
    """, (username,))
    row = cur.fetchone()
    if row:
        cur.execute("""
            UPDATE user_subscriptions
            SET plan=?, status=?, stripe_customer_id=?, stripe_subscription_id=?, current_period_end=?, updated_at=?
            WHERE username=?;
        """, (
            plan, status, stripe_customer_id, stripe_subscription_id, current_period_end,
            datetime.utcnow().isoformat(), username
        ))
    else:
        cur.execute("""
            INSERT INTO user_subscriptions
            (username, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (
            username, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end,
            datetime.utcnow().isoformat()
        ))
    con.commit()
    con.close()

# --------------------------------------------
# 🔎 Endpoint para checar status atual (admin)
# GET /business/payments/subscriptions?username=don
# --------------------------------------------
@payments_verify_bp.route("/subscriptions", methods=["GET"])
def list_subscriptions():
    username = request.args.get("username")
    con = _conn()
    cur = con.cursor()
    if username:
        cur.execute("SELECT username, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at FROM user_subscriptions WHERE username=?;", (username,))
    else:
        cur.execute("SELECT username, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at FROM user_subscriptions;")
    rows = cur.fetchall()
    con.close()

    result = []
    for r in rows:
        result.append({
            "username": r[0],
            "plan": r[1],
            "status": r[2],
            "stripe_customer_id": r[3],
            "stripe_subscription_id": r[4],
            "current_period_end": r[5],
            "updated_at": r[6],
        })
    return jsonify({"ok": True, "items": result})

# --------------------------------------------
# 🧩 Webhook Stripe — sincroniza no banco
# POST /business/payments/stripe_webhook
# --------------------------------------------
@payments_verify_bp.route("/stripe_webhook", methods=["POST"])
def stripe_webhook():
    if stripe is None or not STRIPE_API_KEY:
        return jsonify({"ok": False, "error": "Stripe desativado"}), 200

    stripe.api_key = STRIPE_API_KEY

    payload = request.data
    sig_header = request.headers.get("Stripe-Signature", "")
    event = None

    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(
                payload=payload,
                sig_header=sig_header,
                secret=STRIPE_WEBHOOK_SECRET
            )
        else:
            event = json.loads(payload.decode("utf-8"))
    except Exception as e:
        return jsonify({"ok": False, "error": f"Webhook inválido: {e}"}), 400

    etype = event.get("type") if isinstance(event, dict) else getattr(event, "type", "")
    data_obj = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object

    # Identificação do usuário (para POC usamos metadata.username)
    username = None
    stripe_customer_id = None
    stripe_subscription_id = None
    status = None
    current_period_end = None
    plan = "BASIC"

    try:
        if etype in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            # Checkout concluído
            username = (data_obj.get("metadata") or {}).get("username")
            stripe_customer_id = data_obj.get("customer")
            stripe_subscription_id = data_obj.get("subscription")
            price_id = None
            # Quando subscrição, a linha do price pode vir no subscription expandido; fallback: metadata.price_id
            if data_obj.get("metadata") and data_obj["metadata"].get("price_id"):
                price_id = data_obj["metadata"]["price_id"]
            plan = _plan_from_price(price_id)
            status = "active"
            current_period_end = datetime.utcnow().isoformat()

        elif etype in ("customer.subscription.updated", "customer.subscription.created"):
            username = (data_obj.get("metadata") or {}).get("username")
            stripe_customer_id = data_obj.get("customer")
            stripe_subscription_id = data_obj.get("id")
            status = data_obj.get("status", "active")
            current_period_end = str(data_obj.get("current_period_end") or "")
            # price -> plan
            price_id = None
            try:
                items = data_obj.get("items", {}).get("data", [])
                if items and items[0].get("price") and items[0]["price"].get("id"):
                    price_id = items[0]["price"]["id"]
            except Exception:
                pass
            plan = _plan_from_price(price_id)

        elif etype == "customer.subscription.deleted":
            username = (data_obj.get("metadata") or {}).get("username")
            stripe_customer_id = data_obj.get("customer")
            stripe_subscription_id = data_obj.get("id")
            status = "canceled"
            current_period_end = datetime.utcnow().isoformat()
            plan = "BASIC"

        else:
            # Eventos ignorados
            return jsonify({"ok": True, "ignored": etype}), 200

        # Persistência (se não houver username, apenas loga)
        if username:
            _upsert_subscription(
                username=username,
                plan=plan,
                status=status or "active",
                stripe_customer_id=stripe_customer_id or "",
                stripe_subscription_id=stripe_subscription_id or "",
                current_period_end=current_period_end or ""
            )
        return jsonify({"ok": True, "event": etype}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
