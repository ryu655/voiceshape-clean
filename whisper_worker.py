# whisper_worker.py ← これもまるごと上書き！
from faster_whisper import WhisperModel
from datetime import timedelta
import os
import time

print("【faster-whisper】baseモデルロード中…（Render Free完全対応）")
model = WhisperModel("base", device="cpu", compute_type="int8")

def transcribe_local(filepath, file_id):  # file_id追加！
    print(f"【Whisper処理開始】{filepath}")

    progress_file = f"/tmp/whisper_progress_{file_id}.txt"  # ← ここをfile_idに！

    with open(progress_file, "w", encoding="utf-8") as f:
        f.write("PROGRESS:0.0")

    try:
        segments, info = model.transcribe(
            filepath,
            language="ja",
            word_timestamps=True,
            temperature=0.0,
            beam_size=5,
            best_of=5
        )

        segments = list(segments)

        with open(progress_file, "w", encoding="utf-8") as f:
            f.write("PROGRESS:0.7")

        subtitles = []
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
