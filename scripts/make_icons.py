from pathlib import Path
from PIL import Image, ImageDraw
out = Path(__file__).resolve().parents[1] / 'app/static'
for name, size in [('icon-192.png',192),('icon-512.png',512),('icon-maskable.png',512),('apple-touch-icon.png',180)]:
    image = Image.new('RGB',(512,512),'#7862cb')
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((146,137,366,338),radius=105,fill='#ffffff')
    d.rectangle((146,245,366,340),fill='#ffffff')
    d.rounded_rectangle((122,319,390,357),radius=18,fill='#ffffff')
    d.ellipse((230,365,282,408),fill='#e1d8f4')
    d.rounded_rectangle((242,107,270,159),radius=12,fill='#ffffff')
    d.ellipse((326,106,363,143),fill='#e8c989')
    image.resize((size,size),Image.Resampling.LANCZOS).save(out / name)
