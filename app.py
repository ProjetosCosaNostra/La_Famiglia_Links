from flask import Flask, render_template
from flask_cors import CORS
from routes.ia_routes import ia_bp

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return render_template('index.html')

# Rota da IA
app.register_blueprint(ia_bp, url_prefix='/api')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
