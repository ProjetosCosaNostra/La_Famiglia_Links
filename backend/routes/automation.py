from flask import Blueprint, jsonify, request
import threading
import time
from utils.automator import schedule_posts

automation_bp = Blueprint("automation", __name__)

# Controle do estado
automation_status = {
    "running": False,
    "posts_per_day": 0
}

automation_thread = None

@automation_bp.route("/automation/start", methods=["POST"])
def start_automation():
    global automation_thread, automation_status
    data = request.get_json()
    posts_per_day = data.get("posts_per_day", 3)

    if automation_status["running"]:
        return jsonify({"status": "already_running"}), 400

    automation_status["running"] = True
    automation_status["posts_per_day"] = posts_per_day

    automation_thread = threading.Thread(target=schedule_posts, args=(posts_per_day,))
    automation_thread.daemon = True
    automation_thread.start()

    return jsonify({"status": "started", "posts_per_day": posts_per_day})

@automation_bp.route("/automation/stop", methods=["POST"])
def stop_automation():
    global automation_status
    automation_status["running"] = False
    return jsonify({"status": "stopped"})

@automation_bp.route("/automation/status", methods=["GET"])
def get_status():
    return jsonify(automation_status)
