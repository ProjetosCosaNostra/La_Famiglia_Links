from flask import Flask, render_template
import os
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))


app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
