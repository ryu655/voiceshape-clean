# whisper_worker.py
import whisper
import torch
from datetime import timedelta
import os
import time

# CPU専用（GPUなくても100%動く！）
torch.set_num_threads(4)
model = whisper.load_model("base", compute_type="int8")

def transcribe_local(filepath):
    print(f"【Whisper処理開始】{filepath}")

    # 進捗ファイルのパス（app.pyが読みに行く用）
    progress_file = f"/tmp/whisper_progress_{os.path.basename(filepath)}.txt"

    # 0%で開始
    with open(progress_file, "w") as f:
        f.write("PROGRESS:0.0")

    try:
        # 本物のWhisper処理（これで字幕が正確に生成される！）
        result = model.transcribe(
            filepath,
            language="ja",
            word_timestamps=True,
            fp16=False,
            temperature=0.0
        )

        # 70%まで進捗
        with open(progress_file, "w") as f:
            f.write("PROGRESS:0.7")

        # 字幕整形
        subtitles = []
        for seg in result.get("segments", []):
            start = str(timedelta(seconds=int(seg["start"])))
            end = str(timedelta(seconds=int(seg["end"])))
            text = seg["text"].strip()
            subtitles.append({
                "start": start,
                "end": end,
                "text": text
            })

        # 100%にして完了！
        with open(progress_file, "w") as f:
            f.write("PROGRESS:1.0")

        print(f"【Whisper処理完了】{len(subtitles)}個の字幕生成")

        # 少し待ってから進捗ファイル削除（app.pyが確実に1.0を読むため）
        time.sleep(1)
        try:
            os.remove(progress_file)
        except:
            pass

        return {
            "text": result["text"],
            "subtitles": subtitles,
            "duration": result.get("duration", 0),
            "language": result["language"]
        }

    except Exception as e:
        print(f"【Whisperエラー】{e}")
        # エラー時も進捗ファイル削除
        try:
            os.remove(progress_file)
        except:
            pass
        raise e
