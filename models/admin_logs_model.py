# ============================================
# 🎩 LA FAMIGLIA LINKS — Registro de Auditoria
# Armazena logins, logouts e renovações de sessão
# ============================================

from datetime import datetime
from models.database import Base, get_db
from sqlalchemy import Column, Integer, String, DateTime

class AdminLog(Base):
    __tablename__ = "admin_logs"

    id = Column(Integer, primary_key=True)
    usuario = Column(String(50))
    acao = Column(String(50))
    ip = Column(String(50))
    navegador = Column(String(200))
    data = Column(DateTime, default=datetime.utcnow)

# =====================================================
# 🧩 Função para registrar eventos administrativos
# =====================================================
def registrar_evento(usuario: str, acao: str, ip: str, navegador: str):
    """Registra uma ação administrativa no banco de dados."""
    try:
        db = get_db()
        log = AdminLog(
            usuario=usuario,
            acao=acao,
            ip=ip,
            navegador=navegador,
            data=datetime.utcnow(),
        )
        db.add(log)
        db.commit()
        print(f"🕵️ Log registrado: {acao} — {usuario} ({ip})")
    except Exception as e:
        print(f"⚠️ Falha ao registrar log: {e}")
