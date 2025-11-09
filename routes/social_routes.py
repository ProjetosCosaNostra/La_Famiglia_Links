from flask import Blueprint, render_template
import os

social_bp = Blueprint("social_bp", __name__)

@social_bp.route("/")
def social():
    """Página pública com os links oficiais da Família."""
    keys = [
        "SOCIAL_GITHUB", "SOCIAL_INSTAGRAM", "SOCIAL_LINKEDIN",
        "SOCIAL_TIKTOK", "SOCIAL_YOUTUBE", "SOCIAL_FACEBOOK",
        "SOCIAL_KWAI", "SOCIAL_ML"
    ]

    links = []
    for key in keys:
        url = os.getenv(key)
        if url:
            links.append({
                "nome": key.replace("SOCIAL_", "").title(),
                "url": url
            })

    if not links:
        return {"erro": "Nenhum link social configurado."}, 404

    return render_template("social.html", links=links)
