# 🧩 La Famiglia Links - Flask App (versão de produção estável)

# Imagem base leve do Python
FROM python:3.10-slim

# Define diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependências
COPY requirements.txt .

# Instala dependências sem cache
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante do código para dentro do container
COPY . .

# Expõe a porta usada pelo Flask (10000)
EXPOSE 10000

# Usa Gunicorn para servir em produção
CMD ["gunicorn", "-b", "0.0.0.0:10000", "app:app", "--workers", "4"]
