from PIL import Image, ImageOps
import os, glob
Image.MAX_IMAGE_PIXELS=None
SRC=os.path.expanduser("~/mnt/GDP/Website2026/GraysonDP Dev/images")
OUT=os.path.expanduser("~/mnt/GDP/Website2026/GDP2027/img")

def rgb(p):
    im=Image.open(p)
    if im.mode!="RGB":
        bg=Image.new("RGB", im.size, (255,255,255)); im=im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1]); im=bg
    return im

# ---- hero strip: 8 tiles 520x720
picks=["rural-voices.jpg","rooted-in-care.jpg","giuseppesva2026.jpg","OHM001.jpg",
       "ui2/ui2_02.png","ceo/ceo05.webp","PF_SSP_1080p.jpg","PurpleLine.jpg"]
TW,TH=520,720
strip=Image.new("RGB",(TW*len(picks),TH),(11,11,12))
for i,p in enumerate(picks):
    im=ImageOps.fit(rgb(os.path.join(SRC,p)),(TW,TH),Image.LANCZOS,centering=(0.5,0.4))
    strip.paste(im,(i*TW,0))
strip.save(os.path.join(OUT,"hero-strip.webp"),"WEBP",quality=72,method=5)
print("hero-strip",strip.size,round(os.path.getsize(os.path.join(OUT,'hero-strip.webp'))/1024),"KB")

# ---- logo marquee strips
files=sorted(glob.glob(os.path.join(SRC,"logos_b","*.jpg")))+sorted(glob.glob(os.path.join(SRC,"logos","*.jpg")))+sorted(glob.glob(os.path.join(SRC,"logos","*.png")))
TW,TH,PAD=300,200,34
half=(len(files)+1)//2
for n,chunk in enumerate([files[:half],files[half:]],1):
    strip=Image.new("RGB",(TW*len(chunk),TH),(255,255,255))
    for i,p in enumerate(chunk):
        im=rgb(p); im.thumbnail((TW-PAD*2,TH-PAD*2),Image.LANCZOS)
        tile=Image.new("RGB",(TW,TH),(255,255,255))
        tile.paste(im,((TW-im.width)//2,(TH-im.height)//2))
        strip.paste(tile,(i*TW,0))
    f=f"marks-{n}.webp"; strip.save(os.path.join(OUT,f),"WEBP",quality=82,method=5)
    print(f,strip.size,len(chunk),"tiles",round(os.path.getsize(os.path.join(OUT,f))/1024),"KB")
