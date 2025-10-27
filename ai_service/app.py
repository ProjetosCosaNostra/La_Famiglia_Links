from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import io
import base64

app = FastAPI(title="LaFamiglia AI Service")

# model lazy loader
MODEL = None
PIPELINE = None

class GenerateRequest(BaseModel):
    prompt: str
    width: int = 512
    height: int = 512
    num_inference_steps: int = 20

def load_pipeline():
    global MODEL, PIPELINE
    if PIPELINE is not None:
        return PIPELINE

    # Escolha o modelo que pref desejar; aqui um exemplo genérico
    model_id = os.getenv("HF_MODEL", "stabilityai/stable-diffusion-2")
    from diffusers import DiffusionPipeline
    import torch
    # carregando em CPU
    PIPELINE = DiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float32)
    PIPELINE.to("cpu")
    PIPELINE.safety_checker = None  # opcional, analise riscos de moderação
    return PIPELINE

@app.post("/generate")
def generate(req: GenerateRequest):
    try:
        pipe = load_pipeline()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar pipeline: {e}")

    # gerar imagem
    try:
        image = pipe(
            req.prompt,
            height=req.height,
            width=req.width,
            num_inference_steps=req.num_inference_steps
        ).images[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar: {e}")

    # converte para base64
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)
    img_b64 = base64.b64encode(buf.read()).decode("utf-8")
    return {"image_base64": img_b64}
