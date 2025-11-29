# app.py ← これにまるごと置き換えて！（Render Free + RunPod large-v3 完成版）
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

UPLOAD_FOLDER = "/tmp/uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ←←← ここにRunPodのURLを埋めた！！！
RUNPOD_URL = "https://o9j5l7vb4r8mpf-8000.proxy.runpod.net/transcribe"


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
        duration = librosa.get_duration(path=filepath)  # 警告消し！
        print(f"【音声長さ】{duration:.1f}秒")
    except Exception as e:
        print(f"長さ取得エラー: {e}")
        duration = 999

    if duration <= 300:
        threading.Thread(target=process_audio, args=(file_id,), daemon=True).start()
        return jsonify({"need_payment": False, "file_id": file_id})
    else:
        return jsonify({
            "need_payment": True,
            "file_id": file_id,
            "duration": round(duration, 1),
            "message": "5分を超えています"
        })


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
        print(f"【Whisper処理開始】{file_id}")
        result = transcribe_local(filepath, file_id)  # file_idも渡す！

        result_path = filepath + ".json"
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print(f"【成功】{file_id} の処理完了！字幕数: {len(result.get('subtitles', []))}")

    except Exception as e:
        print(f"【失敗】{file_id}: {e}")
        error_result = {"error": str(e), "subtitles": []}
        with open(filepath + ".json", "w", encoding="utf-8") as f:
            json.dump(error_result, f, ensure_ascii=False)


# これが最重要！無限ループ完全撲滅ルート
@app.route("/result/<file_id>")
def get_result(file_id):
    json_path = os.path.join(UPLOAD_FOLDER, file_id + ".json")

    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return jsonify({"status": "completed", "data": data})
        except:
            return jsonify({"status": "error", "message": "結果読み込み失敗"}), 500

    # まだ処理中（元ファイルはある）
    if os.path.exists(os.path.join(UPLOAD_FOLDER, file_id)):
        return jsonify({"status": "processing", "progress": 0})

    return jsonify({"status": "error", "message": "ファイルが見つかりません"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
