"""Reproduce the production build without uv or Node.js on the server."""

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    commands = [
        [sys.executable, "-m", "pip", "install", "--require-hashes", "-r", "requirements.txt"],
        [sys.executable, "scripts/prepare_assets.py"],
        [sys.executable, "scripts/check_project.py", "--assets"],
    ]
    for command in commands:
        subprocess.run(command, cwd=ROOT, check=True)
    print("Render build completed.", flush=True)


if __name__ == "__main__":
    main()
