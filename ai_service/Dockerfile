# ============================================
# 🧠 LA FAMIGLIA AI SERVICE (CPU Version)
# ============================================
FROM python:3.10-slim

# Pasta de trabalho
WORKDIR /app

# Instala dependências do sistema (para torch/diffusers)
RUN apt-get update && apt-get install -y \
    git ffmpeg libsm6 libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Copia e instala dependências Python específicas de IA
COPY requirements-ai.txt /app/
RUN pip install --no-cache-dir -r requirements-ai.txt

# Copia o código da IA
COPY . .

# Porta padrão (pode ser alterada via docker-compose)
EXPOSE 8000

# Comando padrão (pode ser sobrescrito no docker-compose)
CMD ["uvicorn", "ai_app:app", "--host", "0.0.0.0", "--port", "8000"]
