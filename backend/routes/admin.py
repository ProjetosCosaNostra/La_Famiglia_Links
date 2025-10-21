from flask import Blueprint, send_from_directory
import os

admin_bp = Blueprint('admin_bp', __name__)
FRONTEND_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))

@admin_bp.route('/admin')
def serve_admin():
    """Serve o painel administrativo"""
    return send_from_directory(FRONTEND_PATH, 'admin.html')

@admin_bp.route('/<path:filename>')
def serve_static(filename):
    """Serve arquivos estáticos do frontend"""
    return send_from_directory(FRONTEND_PATH, filename)
