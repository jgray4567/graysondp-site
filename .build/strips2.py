from PIL import Image, ImageDraw, ImageOps, ImageEnhance
import os, glob
SRC=os.path.expanduser("~/mnt/GDP/Website2026/GraysonDP Dev/images")
OUT=os.path.expanduser("~/mnt/GDP/Website2026/GDP2027/img")

def rgb(p):
    im=Image.open(p)
    if im.mode!="RGB":
        bg=Image.new("RGB", im.size,(255,255,255)); im=im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1]); im=bg
    return im

# --- marks: individual rounded white cards on transparency -----------------
files=sorted(glob.glob(os.path.join(SRC,"logos_b","*.jpg")))+sorted(glob.glob(os.path.join(SRC,"logos","*.jpg")))+sorted(glob.glob(os.path.join(SRC,"logos","*.png")))
TW,TH,GAP,PAD,R=300,200,16,36,10
half=(len(files)+1)//2
for n,chunk in enumerate([files[:half],files[half:]],1):
    W=(TW+GAP)*len(chunk)
    strip=Image.new("RGBA",(W,TH),(0,0,0,0))
    for i,p in enumerate(chunk):
        card=Image.new("RGBA",(TW,TH),(0,0,0,0))
        m=Image.new("L",(TW,TH),0); ImageDraw.Draw(m).rounded_rectangle([0,0,TW-1,TH-1],R,fill=255)
        white=Image.new("RGBA",(TW,TH),(255,255,255,255)); card=Image.composite(white,card,m)
        im=rgb(p); im.thumbnail((TW-PAD*2,TH-PAD*2),Image.LANCZOS)
        card.paste(im,((TW-im.width)//2,(TH-im.height)//2))
        card.putalpha(m)
        strip.paste(card,(i*(TW+GAP),0),card)
    f=f"marks-{n}.webp"; strip.save(os.path.join(OUT,f),"WEBP",quality=86,method=5)
    print(f,strip.size,round(os.path.getsize(os.path.join(OUT,f))/1024),"KB")

# --- studio portrait: crop to the principal, duotone into the brand --------
im=rgb(os.path.join(SRC,"about.jpg"))
w,h=im.size
im=im.crop((int(w*0.02),0,int(w*0.56),h))
im=ImageOps.fit(im,(900,1125),Image.LANCZOS,centering=(0.5,0.36))
g=ImageOps.grayscale(im)
g=ImageEnhance.Contrast(g).enhance(1.22)
duo=ImageOps.colorize(g, black=(14,14,17), mid=(92,74,66), white=(244,232,222))
duo.save(os.path.join(OUT,"studio.webp"),"WEBP",quality=80,method=5)
print("studio.webp",duo.size,round(os.path.getsize(os.path.join(OUT,'studio.webp'))/1024),"KB")
