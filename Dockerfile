# ============================================
# 🎩 LA FAMIGLIA LINKS — Build de Produção
# ============================================
FROM python:3.10-slim

WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    git ffmpeg libsm6 libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Copiar dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o projeto completo
COPY . .

# Expor a porta padrão Flask/Render
EXPOSE 10000

# Comando padrão de execução
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "app:app"]
