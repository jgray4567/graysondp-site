from PIL import Image, ImageOps
import os, sys
Image.MAX_IMAGE_PIXELS=None
SRC=os.path.expanduser("~/mnt/GDP/Website2026/GraysonDP Dev/images")
OUT=os.path.expanduser("~/mnt/GDP/Website2026/GDP2027/img")
os.makedirs(OUT, exist_ok=True)

def load(p):
    im=Image.open(os.path.join(SRC,p))
    if im.mode in ("RGBA","P","LA"):
        bg=Image.new("RGB", im.size, (255,255,255))
        im=im.convert("RGBA"); bg.paste(im, mask=im.split()[-1]); im=bg
    return im.convert("RGB")

def save(im, name, w=None, q=76):
    if w and im.width>w:
        h=round(im.height*w/im.width); im=im.resize((w,h), Image.LANCZOS)
    im.save(os.path.join(OUT,name), "WEBP", quality=q, method=5)
    print(name, im.size, round(os.path.getsize(os.path.join(OUT,name))/1024), "KB")

jobs=[
 ("rural-voices.jpg","rural-voices.webp",1760),
 ("RuralVoices002.png","rural-voices-data.webp",1760),
 ("rooted-in-care.jpg","rooted.webp",1760),
 ("Rooted002.png","rooted-policy.webp",1760),
 ("giuseppesva2026.jpg","giuseppes.webp",1600),
 ("ohm_website.jpg","ohm-site.webp",1600),
 ("OHM001.jpg","ohm-mark.webp",1400),
 ("PurpleLine.jpg","purple-line.webp",1600),
 ("NIH_ORS_1080p.jpg","nih-ors.webp",1600),
 ("PF_SSP_1080p.jpg","papal-ssp.webp",1600),
 ("PFAR01_1080p.jpg","papal-ar.webp",1600),
 ("about.jpg","studio.webp",1200),
 ("wts/wts001.jpg","wts.webp",1600),
]
for src,dst,w in jobs:
    if os.path.exists(os.path.join(SRC,src)): save(load(src), dst, w)
    else: print("MISS", src)

for i,n in enumerate(["ui2_01","ui2_02","ui2_06","ui2_04","ui2_21","ui2_19"],1):
    save(load(f"ui2/{n}.png"), f"mil-{i:02d}.webp", 1200)
for i,n in enumerate(["ceo01","ceo05","ceo06","ceo07"],1):
    save(load(f"ceo/{n}.webp"), f"ceo-{i:02d}.webp", 1200)
for i,n in enumerate(["LSA_Mission1","LSA_Mission4","LSA_Mission7"],1):
    p=f"L24/{n}.png"
    if os.path.exists(os.path.join(SRC,p)): save(load(p), f"mission-{i:02d}.webp", 1200)
