import os
from gtts import gTTS
from pydub import AudioSegment

def tts_to_mp3(texto: str, out_path: str, lang: str = "pt") -> str:
    """Converte texto em voz (MP3) usando gTTS."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    tts = gTTS(text=texto, lang=lang)
    tts.save(out_path)
    return out_path

def mix_audio(voice_path: str, bgm_path: str, out_path: str, voice_gain: float = 0.0, bgm_gain: float = -12.0) -> str:
    """
    Mixagem simples entre narração e trilha.
    voice_gain e bgm_gain em dB (valores negativos reduzem volume).
    """
    voice = AudioSegment.from_file(voice_path)
    if os.path.exists(bgm_path):
        bgm = AudioSegment.from_file(bgm_path).apply_gain(bgm_gain)
        # Ajusta duração do BGM para caber na fala
        if len(bgm) < len(voice):
            bgm = bgm * (len(voice) // len(bgm) + 1)
        bgm = bgm[:len(voice)]
        mixed = voice.apply_gain(voice_gain).overlay(bgm)
    else:
        mixed = voice.apply_gain(voice_gain)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    mixed.export(out_path, format="mp3")
    return out_path