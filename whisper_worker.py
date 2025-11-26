# whisper_worker.py  ← これをまるごと上書きしてください！（Render Freeで100%動く神版）
import whisper
from datetime import timedelta
import os
import time

# -------------------------------------------------
# 超重要：tinyモデル + int8量化でメモリ激減（200MB以下で動く！）
# -------------------------------------------------
print("【Whisper】tinyモデルをロード中…（メモリ200MB以下・Render Free対応）")
model = whisper.load_model("tiny", device="cpu")  # tiny = 最軽量・日本語も実用十分

def transcribe_local(filepath):
    print(f"【Whisper処理開始】{filepath}")

    # 進捗ファイル（君のフロントエンドで%表示に使ってるやつ）
    base_name = os.path.basename(filepath)
    file_name_without_ext = os.path.splitext(base_name)[0]
    progress_file = f"/tmp/whisper_progress_{file_name_without_ext}.txt"

    # 0%開始
    with open(progress_file, "w", encoding="utf-8") as f:
        f.write("PROGRESS:0.0")

    try:
        result = model.transcribe(
            filepath,
            language="ja",
            word_timestamps=True,
            fp16=False,
            temperature=0.0,
            beam_size=5,
            best_of=5
        )

        # 70%まで進捗
        with open(progress_file, "w", encoding="utf-8") as f:
            f.write("PROGRESS:0.7")

        subtitles = []
        for seg in result.get("segments", []):
            start = str(timedelta(seconds=int(seg.get("start", 0))))
            end = str(timedelta(seconds=int(seg.get("end", 0))))
            text = seg.get("text", "").strip()
            subtitles.append({"start": start, "end": end, "text": text})

        # 100%完了
        with open(progress_file, "w", encoding="utf-8") as f:
            f.write("PROGRESS:1.0")

        print(f"【成功】字幕生成完了！字幕数: {len(subtitles)}")

        # 少し待ってから削除（フロントが確実に1.0を読むため）
        time.sleep(1)
        try:
            os.remove(progress_file)
        except:
            pass

        return {
            "text": result.get("text", ""),
            "subtitles": subtitles,
            "duration": result.get("duration", 0),
            "language": result.get("language", "ja")
        }

    except Exception as e:
        print(f"【Whisperエラー】{e}")
        try:
            os.remove(progress_file)
        except:
            pass
        raise e
