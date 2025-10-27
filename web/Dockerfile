# Web App (Flask)
FROM python:3.10-slim

WORKDIR /app
COPY requirements-web.txt .
RUN pip install --no-cache-dir -r requirements-web.txt

COPY . .
CMD ["gunicorn", "-b", "0.0.0.0:10000", "app:app"]
