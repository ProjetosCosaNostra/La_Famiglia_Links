import os
from flask import Flask, jsonify
from flask_cors import CORS

# ✅ Fix de imports absolutos
from models.database import init_db, create_default_admin

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return jsonify({"message": "La Famiglia Links — Online 24/7"})

if __name__ == "__main__":
    init_db()
    create_default_admin()
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
