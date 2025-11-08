# ============================================
# 🎩 LA FAMIGLIA LINKS — Build Render Estável
# ============================================
FROM python:3.10-slim

WORKDIR /app

# Dependências do sistema
RUN apt-get update && apt-get install -y \
    git ffmpeg libsm6 libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar as libs Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o restante do projeto
COPY . .

# Expor a porta padrão
EXPOSE 10000

# Variáveis obrigatórias do Flask
ENV FLASK_APP=app.py
ENV FLASK_RUN_PORT=10000
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Rodar o Flask diretamente (sem Gunicorn)
CMD ["python", "app.py"]
