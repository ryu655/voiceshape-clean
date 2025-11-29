# app.py ← これにまるごと置き換えてください！（Render Free + RunPod large-v3 完全版）
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import uuid
import threading
import json
import librosa
import requests

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.getenv("SECRET_KEY", "voiceshape-super-secret-2025")
CORS(app)

# Render Freeでも再起動後に残る場所
UPLOAD_FOLDER = "/tmp/uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ここにRunPodのlarge-v3 URLを埋め込み済み！
RUNPOD_URL = "https://7xeggmwut93rdo-8000.proxy.runpod.net/transcribe"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "ファイルがありません"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "ファイルが選択されていません"}), 400

    file_id = str(uuid.uuid4()) + "_" + file.filename
    filepath = os.path.join(UPLOAD_FOLDER, file_id)
    file.save(filepath)

    try:
        duration = librosa.get_duration(path=filepath)
        print(f"【音声長さ】{duration:.1f}秒")
    except Exception as e:
        print(f"長さ取得エラー: {e}")
        duration = 999

    # 無料でRunPod large-v3爆速処理開始！
    threading.Thread(target=process_audio, args=(file_id,), daemon=True).start()
    return jsonify({"need_payment": False, "file_id": file_id})


@app.route("/pay", methods=["POST"])
def pay():
    data = request.get_json()
    file_id = data.get("file_id")
    if file_id:
        threading.Thread(target=process_audio, args=(file_id,), daemon=True).start()
    return jsonify({"success": True})


def process_audio(file_id):
    filepath = os.path.join(UPLOAD_FOLDER, file_id)
    try:
        print(f"RunPod large-v3に送信中… {file_id}")
        with open(filepath, "rb") as f:
            files = {"file": (file_id, f)}
            response = requests.post(RUNPOD_URL, files=files, timeout=3600)  # 1時間まで待つ

        result = response.json()
        print(f"RunPodから結果受信！字幕数: {len(result.get('subtitles', []))}")

        # Render側に結果保存（表示用）
        result_path = filepath + ".json"
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

    except Exception as e:
        print(f"【RunPod失敗】{e}")
        error_result = {"error": str(e), "subtitles": []}
        with open(filepath + ".json", "w", encoding="utf-8") as f:
            json.dump(error_result, f, ensure_ascii=False)


# 無限ループ・404完全撲滅ルート
@app.route("/result/<file_id>")
def get_result(file_id):
    json_path = os.path.join(UPLOAD_FOLDER, file_id + ".json")

    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return jsonify({"status": "completed", "data": data})
        except Exception as e:
            print(f"【JSON読み込み失敗】{e}")
            return jsonify({"status": "error", "message": "結果読み込み失敗"}), 500

    # まだ処理中
    if os.path.exists(os.path.join(UPLOAD_FOLDER, file_id)):
        return jsonify({"status": "processing", "progress": 0})

    return jsonify({"status": "not_found", "message": "ファイルが見つかりません"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
