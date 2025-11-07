from flask import Blueprint, render_template

links_bp = Blueprint("links_bp", __name__)

@links_bp.route("/links")
def links_home():
    return render_template("index.html")
