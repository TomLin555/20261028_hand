"""Prepare self-hosted SDK/WASM/model assets; Node.js is not required on Render."""

import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "pro03" / "static"


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "GestureGallery/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def prepare() -> None:
    manifest = json.loads((ROOT / "assets-manifest.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    package = lock["packages"]["node_modules/@mediapipe/tasks-vision"]
    vendor = STATIC / "vendor"
    marker = vendor / ".integrity"
    expected_files = ["vision_bundle.mjs", "wasm/vision_wasm_internal.js", "wasm/vision_wasm_internal.wasm",
                      "wasm/vision_wasm_nosimd_internal.js", "wasm/vision_wasm_nosimd_internal.wasm",
                      "wasm/vision_wasm_module_internal.js", "wasm/vision_wasm_module_internal.wasm"]
    if not (marker.exists() and marker.read_text() == package["integrity"]
            and all((vendor / path).is_file() for path in expected_files)):
        print(f"Downloading MediaPipe SDK {package['version']}...")
        archive = download(package["resolved"])
        actual = "sha512-" + base64.b64encode(hashlib.sha512(archive).digest()).decode()
        if actual != package["integrity"]:
            raise RuntimeError("SDK integrity mismatch")
        # Only known files are extracted: no arbitrary tar paths or links.
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as bundle:
            for relative in expected_files:
                member = bundle.getmember("package/" + relative)
                if not member.isfile():
                    raise RuntimeError("SDK asset must be a regular file")
                target = vendor / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as source:
                    target.write_bytes(source.read())
        marker.write_text(package["integrity"])
    target = STATIC / "models" / "gesture_recognizer.task"
    expected = manifest["model"]["sha256"]
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
        print("Downloading gesture model (float16, version 1)...")
        model = download(manifest["model"]["url"])
        if hashlib.sha256(model).hexdigest() != expected:
            raise RuntimeError("Model integrity mismatch")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(model)
    print("SDK, WASM and model assets are ready.")


if __name__ == "__main__":
    prepare()
