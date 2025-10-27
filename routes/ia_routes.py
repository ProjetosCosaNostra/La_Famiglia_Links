import os
import requests
from flask import Blueprint, request, jsonify

ia_bp = Blueprint('ia_bp', __name__)

HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2"
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")

@ia_bp.route('/generate', methods=['POST'])
def generate_image():
    data = request.get_json()
    prompt = data.get("prompt")

    headers = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}
    payload = {"inputs": prompt}

    response = requests.post(HUGGINGFACE_API_URL, headers=headers, json=payload)
    
    if response.status_code == 200:
        return jsonify({"image_base64": response.json()[0]["generated_image_base64"]})
    else:
        return jsonify({"error": response.text}), response.status_code
