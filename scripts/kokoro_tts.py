"""Batch text-to-speech with Kokoro-82M (https://huggingface.co/hexgrad/Kokoro-82M, Apache-2.0).

Called by scripts/generate-audio.mjs. Reads a JSON job list from stdin:

    {"jobs": [{"text": "...", "voice": "af_heart", "lang": "a", "speed": 0.9, "out": "path.wav"}, ...]}

(top-level "voice"/"lang" act as defaults for jobs that omit them). Loads the model once, writes one 24 kHz mono WAV per job and prints one JSON line per job
({"out": ..., "ok": true} or {"out": ..., "ok": false, "error": ...}) so the caller can track progress.

Run with the project venv:  .venv-kokoro/bin/python scripts/kokoro_tts.py < jobs.json
"""

import json
import sys
import warnings

warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro import KPipeline  # noqa: E402

SAMPLE_RATE = 24000


def main() -> None:
    spec = json.load(sys.stdin)
    pipelines: dict[str, KPipeline] = {}
    model = None  # shared between language pipelines so the weights load once
    for job in spec["jobs"]:
        try:
            lang = job.get("lang", spec.get("lang", "a"))
            voice = job.get("voice", spec.get("voice"))
            if lang not in pipelines:
                pipelines[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M", model=model if model is not None else True)
                model = pipelines[lang].model
            pipeline = pipelines[lang]
            chunks = [
                audio.numpy() if hasattr(audio, "numpy") else np.asarray(audio)
                for _, _, audio in pipeline(job["text"], voice=voice, speed=job.get("speed", 1.0))
                if audio is not None
            ]
            if not chunks:
                raise RuntimeError("no audio produced")
            sf.write(job["out"], np.concatenate(chunks), SAMPLE_RATE)
            print(json.dumps({"out": job["out"], "ok": True}), flush=True)
        except Exception as e:  # keep going; the caller flags failures
            print(json.dumps({"out": job["out"], "ok": False, "error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
