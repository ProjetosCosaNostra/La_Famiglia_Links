# business/autopost/models.py
from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime
from models.database import Base

class AutopostLog(Base):
    __tablename__ = "autopost_logs"

    id = Column(Integer, primary_key=True)
    rede = Column(String(50))
    midia_tipo = Column(String(20))     # banner | video
    arquivo = Column(String(500))
    legenda = Column(Text)
    status = Column(String(20))         # ok | erro
    detalhe = Column(Text)
    criado_em = Column(DateTime, default=datetime.utcnow)
