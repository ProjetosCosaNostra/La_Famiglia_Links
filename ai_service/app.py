from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, io, base64

app = FastAPI(title="La Famiglia AI Image Generator")

# Permitir integração com o painel Flask/Business
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = None
PIPELINE = None

class GenerateRequest(BaseModel):
    prompt: str
    width: int = 512
    height: int = 512
    num_inference_steps: int = 20

def load_pipeline():
    global PIPELINE
    if PIPELINE is not None:
        return PIPELINE
    model_id = os.getenv("HF_MODEL", "stabilityai/stable-diffusion-2")
    from diffusers import DiffusionPipeline
    import torch
    PIPELINE = DiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float32)
    PIPELINE.to("cpu")
    PIPELINE.safety_checker = None
    return PIPELINE

@app.get("/status")
def status():
    return {"status": "online", "model": os.getenv("HF_MODEL", "stabilityai/stable-diffusion-2")}

@app.post("/generate")
def generate(req: GenerateRequest):
    try:
        pipe = load_pipeline()
        image = pipe(
            req.prompt,
            height=req.height,
            width=req.width,
            num_inference_steps=req.num_inference_steps
        ).images[0]

        buf = io.BytesIO()
        image.save(buf, format="PNG")
        buf.seek(0)
        img_b64 = base64.b64encode(buf.read()).decode("utf-8")
        return {"image_base64": img_b64}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar imagem: {e}")
