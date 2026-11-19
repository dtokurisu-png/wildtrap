from PIL import Image,ImageStat
from pathlib import Path
f=Path('assets/terrain/texturas/terreno_handpaint_4K.webp')
im=Image.open(f).convert("RGBA")
print("ART_DIAGNOSTICS",im.size,"mode",im.mode,"filesize",f.stat().st_size)
a=im.getchannel('A')
h=a.histogram()
total=im.width*im.height
for lo,hi,label in [(0,0,'transparent'),(1,63,'alpha_1_63'),(64,127,'alpha_64_127'),(128,191,'alpha_128_191'),(192,254,'alpha_192_254'),(255,255,'opaque')]:
 n=sum(h[lo:hi+1]);print('ALPHA',label,n,round(n/total*100,3),'percent')
print('RGB_AVERAGE',tuple(round(v,2) for v in ImageStat.Stat(im).mean))
for x,y in [(0,0),(.25,.25),(.5,.5),(.75,.75),(1,1),(.5,.1),(.1,.5)]:
 px,py=min(im.width-1,round(x*(im.width-1))),min(im.height-1,round(y*(im.height-1)))
 print("PIXEL",x,y,im.getpixel((px,py)))
