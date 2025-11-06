# business/media_ai/models.py
from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from models.database import Base

class VideoGerado(Base):
    __tablename__ = "midia_videos"

    id = Column(Integer, primary_key=True)
    titulo = Column(String(200))
    descricao = Column(String(500))
    imagem_origem = Column(String(500))
    arquivo = Column(String(500))         # caminho do .mp4
    criado_em = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "titulo": self.titulo,
            "descricao": self.descricao,
            "imagem_origem": self.imagem_origem,
            "arquivo": self.arquivo,
            "criado_em": self.criado_em.strftime("%d/%m/%Y %H:%M"),
        }

class BannerGerado(Base):
    __tablename__ = "midia_banners"

    id = Column(Integer, primary_key=True)
    titulo = Column(String(200))
    preco_txt = Column(String(50))
    imagem_origem = Column(String(500))
    arquivo = Column(String(500))         # caminho do .jpg
    criado_em = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "titulo": self.titulo,
            "preco_txt": self.preco_txt,
            "imagem_origem": self.imagem_origem,
            "arquivo": self.arquivo,
            "criado_em": self.criado_em.strftime("%d/%m/%Y %H:%M"),
        }
