# ============================================
# 🎩 LA FAMIGLIA LINKS — Build de Produção
# ============================================
FROM python:3.10-slim

WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    git ffmpeg libsm6 libxext6 curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar todo o projeto
COPY . .

# Healthcheck para Render detectar se está ativo
HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:10000/healthz || exit 1

# Expor a porta padrão
EXPOSE 10000

# Executar com Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "app:app", "--timeout", "300"]
