# Garment list for the game body. Uses the names from garm.py (exec'd in the same namespace).
def make_all(S0):
    co, J = S0['co'], S0['J']
    z = co[:, 2]; x = co[:, 0]
    G = []
    # arm progress along the upper arm (0 shoulder joint .. 1 elbow), per body vertex
    def armt(side):
        L = 'Left' if side > 0 else 'Right'
        a, b = J[L + 'Arm'], J[L + 'ForeArm']; ax = b - a
        return ((co - a) @ ax) / (ax @ ax)
    tL, tR = armt(1), armt(-1)
    isArmL = inset({'LeftArm', 'LeftForeArm', 'LeftHand', 'LThumb', 'LeftFingerBase', 'LeftHandFinger1'})
    isArmR = inset({'RightArm', 'RightForeArm', 'RightHand', 'RThumb', 'RightFingerBase', 'RightHandFinger1'})
    front = co[:, 1] < S0['hc'][1] + 0.02
    hipz, waist = J['Hips'][2], J['Hips'][2] + 0.075
    upleg = J['LeftUpLeg'][2]; knee = J['LeftLeg'][2]; ankle = J['LeftFoot'][2]
    neckz = J['Neck'][2]

    def top_mask(hem, sleeve, neck_front, neck_back):
        m = (inset(TORSO) | inset({'LeftShoulder', 'RightShoulder', 'LHipJoint', 'RHipJoint'}))
        m |= (isArmL & (tL < sleeve) & inset({'LeftArm'})) | (isArmR & (tR < sleeve) & inset({'RightArm'}))
        m &= z > hem
        m &= z < np.where(front, neck_front, neck_back)
        return m
    # Tee: loose at the belly and hem, short sleeves
    off = 0.011 + 0.010 * smooth01(1.25, 0.95, z)
    G.append(Skin('Cloth_Tee', top_mask(upleg + 0.005, 0.5, neckz - 0.03, neckz + 0.005), off, hem=0.004))
    # Dress top (fitted, cap sleeves, scooped neck), worn over the skirt waistband
    G.append(Skin('Cloth_DressTop', top_mask(J['Spine'][2] - 0.145, 0.3, neckz - 0.06, neckz - 0.01), 0.010 + 0.004 * smooth01(1.2, 1.08, z), hem=0.003))
    # Trousers / shorts
    legm = inset(LEG | FOOT) | (inset({'Hips', 'LowerBack'}) & (z < waist))
    off_tr = 0.010 + 0.016 * smooth01(knee + 0.05, ankle, z)
    G.append(Skin('Cloth_Trousers', legm & (z > ankle + 0.025) & (z < waist), off_tr, hem=0.004))
    G.append(Skin('Cloth_Shorts', legm & (z > knee + 0.07) & (z < waist), 0.012 + 0.012 * smooth01(upleg - 0.1, knee + 0.07, z), hem=0.006))
    # Ngemb (wrestling loincloth): A short, B longer
    G.append(Skin('Ngemb_A', legm & (z > upleg - 0.16) & (z < waist + 0.01), 0.014, hem=0.004))
    G.append(Skin('Ngemb_B', legm & (z > upleg - 0.27) & (z < waist + 0.01), 0.016 + 0.01 * smooth01(upleg - 0.1, upleg - 0.27, z), hem=0.006))
    # Shoes
    fm = inset(FOOT) | (inset({'LeftLeg', 'RightLeg'}) & (z < ankle + 0.035))
    def sole(v, S, g):
        v = v.copy(); v[:, 2] = np.maximum(v[:, 2], -0.004); return v
    G.append(Skin('Cloth_Shoes', fm, 0.011, hem=0.003, post=sole))
    # Beard: jaw and chin below the mouth corners, plus a moustache
    lipz = co[LIPS, 2]; mouth = lipz.mean(); lip_top = lipz.max()
    hc = S0['hc']
    hd = inset({'Head', 'Neck1'})
    chin = co[hd & (co[:, 1] < hc[1] - 0.06), 2].min()
    bm = hd & ~LIPS & (co[:, 1] < hc[1] + 0.0) & (z < mouth + 0.004) & (z > chin - 0.035)
    bm |= hd & ~LIPS & (np.abs(x) < 0.03) & (z > lip_top - 0.004) & (z < lip_top + 0.016) & (co[:, 1] < hc[1] - 0.05)
    G.append(Skin('Beard', bm, 0.0045, hem=-0.002))

    # Wrap skirt (pagne): waist to ankle, falls straight from the widest point
    zw = J['Hips'][2] + 0.6 * (J['Spine'][2] - J['Hips'][2])
    nsk = 12
    def skirt_z(S):
        J = S['J']; top = J['Hips'][2] + 0.6 * (J['Spine'][2] - J['Hips'][2]); bot = J['LeftFoot'][2] + 0.005
        return [top + (bot - top) * (k / (nsk - 1)) ** 1.15 for k in range(nsk)]
    bodym = inset(TORSO | LEG | FOOT) & ~inset(ARM)
    def skirt_r(S, k, env, zz, prev):
        ease = 0.006 if k == 0 else 0.016
        r = env + ease
        if prev is not None: r = np.maximum(r, prev * 0.985)
        return r
    sk = Tube('Cloth_Skirt', nsk, skirt_z, skirt_r, bodym, None)
    sk.weights = tube_weights(nsk, skirt_z(S0), 0.85, hipz - 0.02, ankle); G.append(sk)

    # Boubou robe: neck to ankle, flaring from the hips; bell sleeves as separate tubes in the same mesh
    nrb = 16
    def robe_z(S):
        J = S['J']; nz = J['Neck'][2] + 0.005; sh = J['LeftArm'][2] + 0.035; hz = J['Hips'][2]; bot = J['LeftFoot'][2] + 0.01
        top = [nz, (nz + sh) / 2, sh]
        mid = [sh - (sh - hz) * t for t in (0.2, 0.42, 0.64, 0.84, 1.0)]
        low = [hz - (hz - bot) * t for t in (0.15, 0.32, 0.48, 0.63, 0.77, 0.89, 1.0)]
        return top + mid + low + [bot - 0.0][:0]
    trunk = inset(TORSO | LEG | FOOT | {'Neck'}) & ~inset(ARM)
    def robe_r(S, k, env, zz, prev):
        J = S['J']; hz = J['Hips'][2]; bot = J['LeftFoot'][2]
        if k == 0: return env + 0.012
        if k <= 2: return env + 0.02
        if zz > hz: return np.maximum(env + 0.032, prev * 0.9 if prev is not None else 0)
        t = (hz - zz) / (hz - bot)
        flare = np.sqrt((np.sin(TH) * (0.2 + 0.17 * t)) ** 2 + (np.cos(TH) * (0.16 + 0.1 * t)) ** 2)
        return np.maximum(np.maximum(env + 0.035, prev * 0.99), flare)
    rb = Tube('Cloth_Boubou', len(robe_z(S0)), robe_z, robe_r, trunk, None)
    rz0 = robe_z(S0)
    w = tube_weights(len(rz0), rz0, 0.5, hipz - 0.02, ankle)
    # upper rings follow the spine (nearest body weights, torso bones only)
    vtmp = rb.build(S0)
    up = np.array([k for k in range(len(rz0)) if rz0[k] > hipz + 0.08])
    if len(up):
        rows = np.concatenate([np.arange(N_AROUND) + k * N_AROUND for k in up])
        w[rows] = knn_weights(vtmp[rows], S0, inset(TORSO | {'Neck'}), 6)
    rb.weights = w; G.append(rb)
    G.append(Sleeve('Cloth_Boubou_SleeveL', 1)); G.append(Sleeve('Cloth_Boubou_SleeveR', -1))

    # ---- head caps
    ez = S0['ez']
    def lonc(d): return -d[1] / max(1e-6, math.hypot(d[0], d[1]))      # cos(lon): 1 front, -1 back
    def hairline(d, a=0.078, s=0.014, b=-0.085):
        c = lonc(d); A = s; B = (a - b) / 2; Q = a - A - B
        return ez + A + B * c + Q * c * c
    G.append(Cap('Hair_Short', hairline, lambda d, S, k: 0.0055, S0=S0))
    def puff_e(d, S, k): return 0.008 + 0.055 * max(0.0, d[2] * 0.9 + 0.2) ** 1.3
    G.append(Cap('Hair_Puff', hairline, puff_e, S0=S0, smooth=3))
    def kufi_post(v, S, g):
        v = v.copy(); topz = S['top'] + 0.016; c = shell_centre(S)
        R = g.rows; nc = g.ncol; body = v[1:].reshape(R - 1, nc, 3)
        rim = np.hypot(body[-1, :, 0] - c[0], body[-1, :, 1] - c[1])
        for i in range(R - 1):
            rr = np.hypot(body[i, :, 0] - c[0], body[i, :, 1] - c[1])
            if i >= R // 3:                                   # vertical walls
                sc = np.maximum(1.0, rim / np.maximum(rr, 1e-6))
                body[i, :, 0] = c[0] + (body[i, :, 0] - c[0]) * sc; body[i, :, 1] = c[1] + (body[i, :, 1] - c[1]) * sc
        v[1:] = body.reshape(-1, 3); v[:, 2] = np.minimum(v[:, 2], topz)
        return v
    G.append(Cap('Cloth_Kufi', lambda d: ez + 0.055 + 0.012 * lonc(d), lambda d, S, k: 0.013, post=kufi_post, S0=S0, stop_ears=False))
    upb = np.array([0, 0.45, 1.0]); upb /= np.linalg.norm(upb)
    def wrap_e(d, S, k): return 0.016 + 0.11 * max(0.0, float(d @ upb)) ** 1.4
    G.append(Cap('Cloth_Headwrap', lambda d: hairline(d, 0.07, 0.0, -0.075), wrap_e, S0=S0, smooth=3, stop_ears=False))

    # ---- strands: sides and back only, crown strands swept back
    rng = np.random.default_rng(7)
    def mk_roots(lats, step, lon_lo, lon_hi):
        out = []
        for lat in lats:
            for lon in np.arange(lon_lo, lon_hi + 1e-6, step):
                out.append((math.radians(lat), math.radians(lon + rng.uniform(-5, 5))))
        return out
    roots = mk_roots((40, 62, 84), 22, 70, 290) + mk_roots((22,), 30, 95, 265)
    def braid_len(lat, lon, S):
        back = -math.cos(lon)
        return (0.24 + 0.16 * max(0, back), 0.06 + 0.05 * max(0, back) + (0.04 if lat < 0.5 else 0))
    G.append(Strands('Hair_Braids', roots, 0.009, braid_len, sides=4, segs=8, S0=S0))
    def loc_len(lat, lon, S):
        back = -math.cos(lon)
        return (0.17 + 0.08 * max(0, back), 0.03 + 0.04 * max(0, back) + (0.04 if lat < 0.5 else 0))
    G.append(Strands('Hair_Locs', roots, 0.013, loc_len, sides=5, segs=7, S0=S0))
    return G
