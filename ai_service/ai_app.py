from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import torch

app = FastAPI(title="La Famiglia AI", version="1.0")

# Permite requisições do Flask principal (localhost e produção)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class TextRequest(BaseModel):
    text: str

@app.get("/")
def home():
    return {"message": "🧠 La Famiglia AI pronta para servir!"}

@app.get("/status")
def status():
    return {"status": "online", "service": "La Famiglia AI"}

@app.post("/analyze")
def analyze(req: TextRequest):
    tensor = torch.tensor([len(req.text)])
    return {"input": req.text, "tensor_sum": tensor.item()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
