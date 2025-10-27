# AI Service (CPU)
FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git ffmpeg libsm6 libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-ai.txt .
RUN pip install --no-cache-dir -r requirements-ai.txt

COPY . .
CMD ["python", "ai_app.py"]
