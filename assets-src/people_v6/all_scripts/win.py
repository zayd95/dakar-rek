import numpy as np
exec(open('ana.py').read().split('for f in sorted')[0])
def norm_desc(P):
    d,yaw=desc(P); return d/18.0, yaw
def best(n, Lmin, Lmax, score_fn=None, step=2, top=3, seated=None):
    P=load(n); d,yaw=norm_desc(P); h=P[:,ix['Hips']]/18.0
    T=len(P); res=[]
    vel=np.linalg.norm(np.diff(d,axis=0),axis=2).mean(1); vel=np.r_[vel,vel[-1]]
    for a in range(0,T-Lmin,step):
        for L in range(Lmin, min(Lmax,T-a-2)+1, 2):
            b=a+L
            loop=np.linalg.norm(d[a]-d[b],axis=1).mean()+np.linalg.norm((d[a+1]-d[a])-(d[b+1]-d[b]),axis=1).mean()*3
            trav=np.linalg.norm(h[a:b,:2]-h[a,:2],axis=1).max()
            turn=np.abs(np.angle(np.exp(1j*(yaw[a:b]-yaw[a])))).max()
            extra=score_fn(P,d,a,b) if score_fn else 0
            s=loop*10+trav*1.5+turn*0.6+extra
            res.append((s,a,L,loop,trav,turn,extra))
    res.sort()
    out=[]
    for r in res:
        if all(abs(r[1]-o[1])>20 for o in out): out.append(r)
        if len(out)>=top: break
    for r in out: print(n, 'start',r[1],'len',r[2],f"score {r[0]:.2f} loop {r[3]:.3f} trav {r[4]:.2f} turn {r[5]:.2f} extra {r[6]:.2f}")
    return out
def energy(P,d,a,b):
    hands=d[a:b,[ix['LeftHand'],ix['RightHand']]]
    return -np.linalg.norm(np.diff(hands,axis=0),axis=2).mean()*40
def calm(P,d,a,b):
    return np.linalg.norm(np.diff(d[a:b],axis=0),axis=2).mean()*60
def phone(P,d,a,b):
    hd=np.minimum(np.linalg.norm(P[a:b,ix['RightHand']]-P[a:b,ix['Head']],axis=1),np.linalg.norm(P[a:b,ix['LeftHand']]-P[a:b,ix['Head']],axis=1))/18
    return np.mean(hd>0.25)*3
def wave(P,d,a,b):
    up=(P[a:b,ix['RightHand'],2]>P[a:b,ix['Head'],2]-0.5)
    return (1-up.mean())*4
import sys
print('--idle'); best('40_10',100,180,calm); best('18_08',100,180,calm); best('79_15',90,160,calm)
print('--talk'); best('18_08',120,200,energy); best('19_08',120,200,energy)
print('--phone'); best('80_25',100,200,phone); best('79_36',60,120,phone)
print('--eat'); best('80_24',90,180,calm); best('79_15',90,180,None)
print('--wave'); best('13_26',30,80,wave)
print('--sit'); best('86_15',120,200,lambda P,d,a,b: calm(P,d,a,b)+np.mean(P[a:b,0,2]>14.5)*5); best('114_05',120,200,lambda P,d,a,b: calm(P,d,a,b)+np.mean(P[a:b,0,2]>12.5)*5)
