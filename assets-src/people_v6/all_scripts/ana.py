import numpy as np, glob, os
D='/mnt/user-data/uploads/DakarRek-assets/mocap_cmu/ana/'
J=['Hips','Head','LeftHand','RightHand','LeftFoot','RightFoot','LeftForeArm','RightForeArm','LeftLeg','RightLeg','Spine1','LeftUpLeg','RightUpLeg','LeftArm','RightArm','Neck']
ix={j:i for i,j in enumerate(J)}
def load(n):
    z=np.load(D+n+'.npz'); return z['P'][1:]   # skip T-pose frame
def desc(P):
    h=P[:,ix['Hips']]; r=P[:,ix['RightUpLeg']]-P[:,ix['LeftUpLeg']]
    yaw=np.arctan2(r[:,1],r[:,0])
    rel=P-h[:,None,:]
    c,s=np.cos(-yaw),np.sin(-yaw)
    x=rel[...,0]*c[:,None]-rel[...,1]*s[:,None]; y=rel[...,0]*s[:,None]+rel[...,1]*c[:,None]
    out=np.stack([x,y,rel[...,2]],-1); out[:,:,2]+=h[:,None,2]*0  # keep height relative
    return out, yaw
def summary(n):
    P=load(n); d,yaw=desc(P); h=P[:,ix['Hips']]; head=P[:,ix['Head']]
    stand=np.percentile(head[:,2]-P[:,ix['LeftFoot']][:,2].clip(max=None),95)
    hh=h[:,2]
    rh=P[:,ix['RightHand']][:,2]-head[:,2]; lh=P[:,ix['LeftHand']][:,2]-head[:,2]
    print(f"{n}: frames {len(P)} hips z {hh.min():.2f}-{hh.max():.2f} (med {np.median(hh):.2f}) travel {np.linalg.norm(h[-1,:2]-h[0,:2]):.2f} path {np.sum(np.linalg.norm(np.diff(h[:,:2],axis=0),axis=1)):.1f} Rhand>head {np.mean(rh>-0.05):.2f} Lhand>head {np.mean(lh>-0.05):.2f}")
for f in sorted(glob.glob(D+'*.npz')): summary(os.path.basename(f)[:-4])
