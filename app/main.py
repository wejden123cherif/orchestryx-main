from fastapi import FastAPI

app = FastAPI(title="Orchestryx API")

@app.get("/health")
def health():
    return {"status": "ok"}