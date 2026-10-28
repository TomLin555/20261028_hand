"""Validate tracked deployment inputs and optionally the prepared runtime assets."""

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "pro03" / "static"


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def canonical(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def check_project(assets: bool = False) -> None:
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    lock = tomllib.loads((ROOT / "uv.lock").read_text(encoding="utf-8"))
    requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8").replace("\\\n", " ")
    pinned = {}
    for line in requirements.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^([\w.-]+)==([^\s;]+)", line)
        check(match is not None, "Requirements must contain only exact pinned registry packages")
        name, version = match.groups()
        check("--hash=sha256:" in line, f"Missing package hash: {name}")
        pinned[canonical(name)] = version
    expected = {canonical(package["name"]): package["version"]
                for package in lock["package"] if "registry" in package.get("source", {})}
    check(pinned == expected, "requirements.txt differs from uv.lock; regenerate it with uv export")
    for dependency in project["dependencies"]:
        name, version = dependency.split("==", 1)
        check(pinned.get(canonical(name)) == version, f"Direct dependency differs: {name}")
    for name, version in pinned.items():
        check(importlib.metadata.version(name) == version, f"Installed package differs: {name}")
    runtime = (ROOT / ".python-version").read_text().strip()
    check(runtime == ".".join(map(str, sys.version_info[:3])), f"Expected Python {runtime}")
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    node_lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    sdk = node_lock["packages"]["node_modules/@mediapipe/tasks-vision"]
    check(sdk["version"] == package["dependencies"]["@mediapipe/tasks-vision"], "SDK lock version differs")
    manifest = json.loads((ROOT / "assets-manifest.json").read_text(encoding="utf-8"))
    image_root = (STATIC / "images").resolve()
    for picture in manifest["images"]:
        path = (image_root / picture["file"]).resolve()
        check(path.is_relative_to(image_root), "Image path escapes its directory")
        check(path.is_file(), f"Missing sample image: {picture['file']}")
        check(hashlib.sha256(path.read_bytes()).hexdigest() == picture["sha256"], f"Image hash differs: {picture['file']}")
    for relative in ["index.html", "styles.css", "app.js", "gestures.js", "vision-worker.js"]:
        check((STATIC / relative).is_file(), f"Missing frontend file: {relative}")
    if assets:
        model = STATIC / "models" / "gesture_recognizer.task"
        check(model.is_file(), "Missing model; run scripts/prepare_assets.py")
        check(hashlib.sha256(model.read_bytes()).hexdigest() == manifest["model"]["sha256"], "Model hash differs")
        vendor = STATIC / "vendor"
        integrity = vendor / ".integrity"
        check(integrity.is_file() and integrity.read_text() == sdk["integrity"], "SDK integrity marker differs")
        for relative in ["vision_bundle.mjs", "wasm/vision_wasm_internal.js", "wasm/vision_wasm_internal.wasm",
                         "wasm/vision_wasm_nosimd_internal.js", "wasm/vision_wasm_nosimd_internal.wasm",
                         "wasm/vision_wasm_module_internal.js", "wasm/vision_wasm_module_internal.wasm"]:
            check((vendor / relative).is_file() and (vendor / relative).stat().st_size > 0, f"Missing SDK asset: {relative}")
    print(f"Project checks passed: Python {runtime}, {len(pinned)} pinned packages, {len(manifest['images'])} sample images.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", action="store_true", help="Also validate downloaded SDK/WASM/model assets")
    check_project(parser.parse_args().assets)
