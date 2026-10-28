def main() -> None:
    import os

    import uvicorn

    uvicorn.run("pro03.app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
