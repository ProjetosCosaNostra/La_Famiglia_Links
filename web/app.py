import os
import base64
import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

AI_HOST = os.getenv("AI_HOST", "ai")   # nome do serviço docker-compose
AI_PORT = os.getenv("AI_PORT", "8000")
AI_URL = f"http://{AI_HOST}:{AI_PORT}"

@app.route("/")
def index():
    return "<h2>La Famiglia Links — web up</h2>"

@app.route("/generate", methods=["POST"])
def generate():
    data = request.get_json() or {}
    prompt = data.get("prompt")
    if not prompt:
        return jsonify({"error":"missing prompt"}), 400

    payload = {"prompt": prompt}
    try:
        resp = requests.post(f"{AI_URL}/generate", json=payload, timeout=120)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if resp.status_code != 200:
        return jsonify({"error": resp.text}), resp.status_code

    result = resp.json()
    return jsonify(result)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
