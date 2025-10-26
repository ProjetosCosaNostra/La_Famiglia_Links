import os
import sys

# Garante que o Python encontre os módulos internos
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from models.database import init_db, create_default_admin

app = Flask(__name__)
CORS(app)

if __name__ == '__main__':
    init_db()
    create_default_admin()
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
