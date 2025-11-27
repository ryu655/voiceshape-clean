# whisper_worker.py ← これをまるごと上書きしてください！
from faster_whisper import WhisperModel
from datetime import timedelta
import os
import time

print("【faster-whisper】baseモデルロード中…（Render Free完全対応）")
model = WhisperModel("base", device="cpu", compute_type="int8")

def transcribe_local(filepath):
    print(f"【Whisper処理開始】{filepath}")

    base_name = os.path.basename(filepath)
    file_name_without_ext = os.path.splitext(base_name)[0]
    progress_file = f"/tmp/whisper_progress_{file_name_without_ext}.txt"

    with open(progress_file, "w", encoding="utf-8") as f:
        f.write("PROGRESS:0.0")

    try:
        # faster-whisperは (segments, info) を返す
        segments, info = model.transcribe(
            filepath,
            language="ja",
            word_timestamps=True,
            temperature=0.0,
            beam_size=5,
            best_of=5
        )

        with open(progress_file, "w", encoding="utf-8") as f:
            f.write("PROGRESS:0.7")

        subtitles = []
        # segment.start / segment.end / segment.text でアクセス
        for segment in segments:
            start = str(timedelta(seconds=int(segment.start)))
            end = str(timedelta(seconds=int(segment.end)))
            text = segment.text.strip()
            subtitles.append({"start": start, "end": end, "text": text})

        with open(progress_file, "w", encoding="utf-8") as f:
            f.write("PROGRESS:1.0")

        print(f"【成功】字幕生成完了！字幕数: {len(subtitles)}")
        time.sleep(1)
        try:
            os.remove(progress_file)
        except:
            pass

        return {
            "text": " ".join([s["text"] for s in subtitles]),
            "subtitles": subtitles,
            "duration": info.duration,
            "language": info.language
        }

    except Exception as e:
        print(f"【Whisperエラー】{e}")
        try:
            os.remove(progress_file)
        except:
            pass
        raise e
