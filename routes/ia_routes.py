import os
import requests
from flask import Blueprint, request, jsonify

ia_bp = Blueprint('ia_bp', __name__, url_prefix='/api/ia')

HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2"
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")

@ia_bp.route('/generate', methods=['POST'])
def generate_image():
    data = request.get_json() or {}
    prompt = data.get("prompt")

    if not prompt:
        return jsonify({"erro": "Nenhum prompt fornecido."}), 400

    headers = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}
    payload = {"inputs": prompt}

    try:
        response = requests.post(HUGGINGFACE_API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        return jsonify({"erro": f"Falha na comunicação com a API: {e}"}), 500

    result = response.json()
    if isinstance(result, list) and len(result) > 0 and "generated_image_base64" in result[0]:
        return jsonify({"image_base64": result[0]["generated_image_base64"]})
    else:
        return jsonify({"erro": "Resposta inesperada da API."}), 502
