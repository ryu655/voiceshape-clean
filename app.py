from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import uuid
import threading
import json
import librosa
from datetime import datetime
from whisper_worker import transcribe_local

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = "voiceshape-secret"
CORS(app)

UPLOAD_FOLDER = "static/uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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

    # 長さ判定
    try:
        duration = librosa.get_duration(filename=filepath)
        print(f"【音声長さ】{duration:.1f}秒")
    except Exception as e:
        print(f"長さ取得エラー: {e}")
        duration = 999  # 安全側

    # 5分以内なら無料
    if duration <= 300:
        threading.Thread(target=process_audio, args=(file_id,)).start()
        return jsonify({"need_payment": False, "file_id": file_id})

    return jsonify({
        "need_payment": True,
        "file_id": file_id,
        "message": "5分を超えています"
    })

@app.route("/pay", methods=["POST"])
def pay():
    data = request.get_json()
    file_id = data.get("file_id")
    if file_id:
        threading.Thread(target=process_audio, args=(file_id,)).start()
    return jsonify({"success": True})

def process_audio(file_id):
    filepath = os.path.join(UPLOAD_FOLDER, file_id)
    try:
        result = transcribe_local(filepath)

        result_path = filepath + ".json"
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print(f"【成功】{file_id} の処理完了！字幕数: {len(result.get('subtitles', []))}")

    except Exception as e:
        print(f"【失敗】{file_id}: {e}")

@app.route("/result/<file_id>")
def get_result(file_id):
    json_path = os.path.join(UPLOAD_FOLDER, file_id + ".json")

    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            print(f"【結果読み込み成功】{file_id} - 字幕: {len(data.get('subtitles', []))}")
            return jsonify(data)
        except Exception as e:
            print(f"【JSONエラー】{file_id}: {e}")
            return jsonify({"error": "読み込み失敗"}), 500

    # 進捗ファイル
    progress_file = f"/tmp/whisper_progress_{file_id}.txt"
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r") as f:
                content = f.read().strip()
                if content.startswith("PROGRESS:"):
                    progress = float(content.split(":")[1])
                    return jsonify({"progress": progress})
        except:
            pass

    return jsonify({"progress": 0})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
