#!/usr/bin/env python3
"""
Remove o fundo branco do logo Capivara Online, deixando-o transparente.
Uso:
    python remove_bg.py logo-original.png logo.png

- Pixels quase-brancos (claros e sem saturação) viram transparentes.
- A área laranja e a azul são preservadas (têm saturação/cor).
- No fim, recorta as bordas transparentes (trim) para o PNG ficar justo.
"""
import sys
from PIL import Image

def main(src="logo-original.png", out="logo.png",
         brightness=232, max_chroma=18):
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            # branco = muito claro E pouca diferença entre canais (sem cor)
            if mn >= brightness and (mx - mn) <= max_chroma:
                px[x, y] = (r, g, b, 0)
    # recorta as bordas 100% transparentes
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.save(out)
    print(f"OK: {out}  ({im.size[0]}x{im.size[1]})")

if __name__ == "__main__":
    args = sys.argv[1:]
    main(*args) if args else main()
