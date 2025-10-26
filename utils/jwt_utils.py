import os
import jwt
import datetime

# Pegue secret da variável de ambiente, ou use um fallback (mudar em produção)
JWT_SECRET = os.environ.get("JWT_SECRET", "troca_esse_seguro_em_producao")
JWT_ALGO = "HS256"
JWT_EXP_MINUTES = int(os.environ.get("JWT_EXP_MINUTES", "120"))

def create_token(payload: dict) -> str:
    now = datetime.datetime.utcnow()
    data = {
        **payload,
        "iat": now,
        "exp": now + datetime.timedelta(minutes=JWT_EXP_MINUTES)
    }
    token = jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGO)
    # PyJWT retorna str no py3.8+, garantir string
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token

def decode_token(token: str) -> dict | None:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return data
    except Exception:
        return None
