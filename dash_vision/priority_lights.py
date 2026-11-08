"""Illumination-gated reference rules for frequently confused warning symbols.

Templates come from the user's example, not a fixed set of assumed detections.
Only bright saturated pixels and a high shape correlation can activate a rule.
"""
from functools import lru_cache
from pathlib import Path
import cv2
import numpy as np

REGIONS=(
    ('oil_pressure',(15,35,225,140)),
    ('brake_system',(244,16,342,95)),
    ('parking_brake',(342,16,440,95)),
    ('brake_system',(240,95,440,158)),
    ('check_engine',(30,158,198,254)),
    ('charging_system',(251,184,433,320)),
)

def mask(image):
    hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    return (((hsv[:,:,1]>=110)&(hsv[:,:,2]>=120))*255).astype(np.uint8)

@lru_cache(maxsize=1)
def templates():
    source=cv2.imread(str(Path(__file__).with_name('icon_refs')/'priority_symbols.png'))
    if source is None:return []
    result=[]
    for label,(x1,y1,x2,y2) in REGIONS:
        binary=mask(source[y1:y2,x1:x2]);ys,xs=np.nonzero(binary)
        binary=binary[ys.min():ys.max()+1,xs.min():xs.max()+1]
        result.append((label,binary))
    return result

def detect_priority(image):
    binary=mask(image)
    if not np.any(binary):return []
    matches=[]
    # Template scale is independent of a symbol's position or camera resolution.
    scales=sorted(set([1.,1200/440,*np.geomspace(.12,4.,45)]))
    for label,template in templates():
        for scale in scales:
            w,h=round(template.shape[1]*scale),round(template.shape[0]*scale)
            if min(w,h)<12 or h>=binary.shape[0] or w>=binary.shape[1]:continue
            resized=cv2.resize(template,(w,h),interpolation=cv2.INTER_AREA)
            values=cv2.matchTemplate(binary,resized,cv2.TM_CCOEFF_NORMED)
            _,quality,_,(x,y)=cv2.minMaxLoc(values)
            if quality<.80:continue
            region=image[y:y+h,x:x+w]
            hue=cv2.cvtColor(region,cv2.COLOR_BGR2HSV)[:,:,0][binary[y:y+h,x:x+w]>0]
            color='red' if len(hue) and (np.mean((hue<9)|(hue>=150))>.5) else 'amber'
            matches.append({'id':label,'bbox':[x,y,w,h],'color':color,'confidence':'high' if quality>=.9 else 'medium','quality':float(quality)})
    matches.sort(key=lambda item:item['quality'],reverse=True)
    chosen=[]
    for item in matches:
        x,y,w,h=item['bbox'];cx,cy=x+w/2,y+h/2
        if any(abs(cx-(a['bbox'][0]+a['bbox'][2]/2))<max(w,a['bbox'][2])*.5 and abs(cy-(a['bbox'][1]+a['bbox'][3]/2))<max(h,a['bbox'][3])*.5 for a in chosen):continue
        chosen.append(item)
    return chosen
