from fastapi import FastAPI
from pydantic import BaseModel
import torch

app = FastAPI(title="La Famiglia AI", version="1.0")

# Modelo de requisição simples
class TextRequest(BaseModel):
    text: str

@app.get("/")
def home():
    return {"message": "🧠 La Famiglia AI pronta para servir!"}

@app.post("/analyze")
def analyze(req: TextRequest):
    # Exemplo de uso de PyTorch (placeholder)
    tensor = torch.tensor([len(req.text)])
    return {"input": req.text, "tensor_sum": tensor.item()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
