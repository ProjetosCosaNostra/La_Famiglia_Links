from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from models.database import Base

class ProdutoAfiliado(Base):
    __tablename__ = "produtos_afiliados"

    id = Column(Integer, primary_key=True)
    nome = Column(String(200))
    preco = Column(Float)
    link = Column(String(500))
    imagem = Column(String(500))
    origem = Column(String(50))  # Amazon / Mercado Livre
    criado_em = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "nome": self.nome,
            "preco": self.preco,
            "link": self.link,
            "imagem": self.imagem,
            "origem": self.origem,
            "criado_em": self.criado_em.strftime("%d/%m/%Y %H:%M")
        }
