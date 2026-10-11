# Garment / hair generator for the MPFB game body (male1591 proxy on the cmu_mb rig).
# Every garment has a fixed topology computed once on the base body; build(S) gives its vertices for the
# body state S (any phenotype), so phenotype variants become shape keys.
import bpy, numpy as np, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from collections import Counter

P = bpy.data.objects['male1591']; RIG = bpy.data.objects['Human.rig']
GN = [g.name for g in P.vertex_groups]; GI = {n: i for i, n in enumerate(GN)}
BONES = [b.name for b in RIG.data.bones]
NV = len(P.data.vertices)
W = np.zeros((NV, len(GN)))
for v in P.data.vertices:
    for g in v.groups: W[v.index, g.group] = g.weight
BW = np.zeros((NV, len(BONES)))                      # bone weights only, columns in BONES order
for j, b in enumerate(BONES):
    if b in GI: BW[:, j] = W[:, GI[b]]
BW /= np.maximum(BW.sum(1, keepdims=True), 1e-9)
DOM = np.array([BONES[i] for i in BW.argmax(1)])
POLYS = [tuple(f.vertices) for f in P.data.polygons]
EARS = W[:, GI['ears']] > 0.3
LIPS = W[:, GI['lips']] > 0.3

ARM = {'LeftArm', 'LeftForeArm', 'LeftHand', 'LThumb', 'LeftFingerBase', 'LeftHandFinger1',
       'RightArm', 'RightForeArm', 'RightHand', 'RThumb', 'RightFingerBase', 'RightHandFinger1'}
LEG = {'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LHipJoint', 'RHipJoint'}
FOOT = {'LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'}
TORSO = {'Hips', 'LowerBack', 'Spine', 'Spine1', 'LeftShoulder', 'RightShoulder'}
HEADB = {'Neck', 'Neck1', 'Head'}
def inset(names): return np.array([d in names for d in DOM])

def state():
    me = P.data; me.update()
    co = np.empty(NV * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nr = np.empty(NV * 3); me.vertices.foreach_get('normal', nr); nr = nr.reshape(-1, 3)
    J = {b.name: np.array(b.head_local) for b in RIG.data.bones}
    hm = inset({'Head'}) & (co[:, 2] > J['Head'][2] + 0.02)
    hc = co[hm].mean(0); hc[0] = 0.0
    top = co[inset({'Head'}), 2].max()
    eyes = bpy.data.objects['Human.low-poly']
    ez = np.mean([v.co.z for v in eyes.data.vertices])
    bvh = BVHTree.FromPolygons([Vector(c) for c in co], POLYS)
    return dict(co=co, nr=nr, J=J, hc=hc, top=top, ez=ez, bvh=bvh)

def smooth01(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def cyl_uv(v):
    """u around the body (front centre 0.5), v = height / 0.6 m."""
    return np.stack([0.5 + np.arctan2(v[:, 0], -v[:, 1]) / (2 * math.pi), v[:, 2] / 0.6], 1)

class Garment:
    name = ''; faces = []; weights = None; uvsrc = None
    def build(self, S): raise NotImplementedError

# ---------------------------------------------------------------- garments cut from the body surface
class Skin(Garment):
    """Faces of the body whose vertices all pass `mask`, pushed out along the normals by `off` (per body vertex)."""
    def __init__(self, name, mask, off, hem=0.0, post=None, smooth=0):
        self.name = name; self.smooth = smooth
        faces = [f for f in POLYS if all(mask[v] for v in f)]
        used = sorted(set(v for f in faces for v in f)); rm = {v: i for i, v in enumerate(used)}
        self.vidx = np.array(used); self.faces = [[rm[v] for v in f] for f in faces]
        ec = Counter()
        for f in self.faces:
            for a, b in zip(f, f[1:] + f[:1]): ec[tuple(sorted((a, b)))] += 1
        self.bnd = np.zeros(len(used), bool)
        for e, c in ec.items():
            if c == 1: self.bnd[list(e)] = True
        self.off = np.broadcast_to(np.asarray(off, float), (NV,))[self.vidx] + self.bnd * hem
        self.weights = BW[self.vidx]; self.post = post
        nb = [set() for _ in used]
        for f in self.faces:
            for a, b in zip(f, f[1:] + f[:1]): nb[a].add(b); nb[b].add(a)
        self.nb = [sorted(s) for s in nb]
    def build(self, S):
        co, nr = S['co'][self.vidx], S['nr'][self.vidx]
        v = co + nr * self.off[:, None]
        for _ in range(self.smooth):                     # round off the low-poly corners, then stay outside the body
            avg = np.array([v[n].mean(0) if n else v[i] for i, n in enumerate(self.nb)])
            v = np.where(self.bnd[:, None], v, 0.5 * v + 0.5 * avg)
            out = ((v - co) * nr).sum(1); need = self.off * 0.75
            v = v + nr * np.maximum(0, need - out)[:, None]
        return self.post(v, S, self) if self.post else v

# ---------------------------------------------------------------- lofted tubes (skirt, robe)
def hull2(p):
    p = sorted(set(map(tuple, np.round(p, 5))))
    if len(p) < 3: return np.array(p)
    def cr(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in p:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(up) >= 2 and cr(up[-2], up[-1], q) <= 0: up.pop()
        up.append(q)
    return np.array(lo[:-1] + up[:-1])

def ray_hull(h, c, d):
    best = None
    for i in range(len(h)):
        a = h[i]; e = h[(i + 1) % len(h)] - a; w = a - c
        den = d[0] * e[1] - d[1] * e[0]
        if abs(den) < 1e-12: continue
        t = (w[0] * e[1] - w[1] * e[0]) / den; s = (w[0] * d[1] - w[1] * d[0]) / den
        if t > 0 and -1e-6 <= s <= 1 + 1e-6: best = t if best is None else max(best, t)
    return best if best is not None else 0.05

N_AROUND = 24
TH = np.arange(N_AROUND) * 2 * math.pi / N_AROUND
DIRS = np.stack([np.sin(TH), -np.cos(TH)], 1)          # theta 0 = front (-y), increasing toward +x

def envelope(S, mask, z, band=0.05, cy=None):
    co = S['co']; sel = mask & (np.abs(co[:, 2] - z) < band)
    pts = co[sel][:, :2]
    if len(pts) < 3: return np.full(N_AROUND, 0.05), np.array([0.0, cy or 0.0])
    h = hull2(pts)
    c = np.array([0.0, pts[:, 1].mean() if cy is None else cy])
    return np.array([ray_hull(h, c, d) for d in DIRS]), c

def loft_faces(nr, closed_bottom=False):
    f = []
    for k in range(nr - 1):
        for i in range(N_AROUND):
            j = (i + 1) % N_AROUND
            a, b, c, d = k * N_AROUND + i, k * N_AROUND + j, (k + 1) * N_AROUND + j, (k + 1) * N_AROUND + i
            f.append([a, d, c, b])
    return f

class Tube(Garment):
    """Rings top to bottom. zs(S) -> ring heights; radius(S, k, env, z) -> radii; mask picks the body verts that shape it."""
    def __init__(self, name, nrings, zs, radius, mask, weights_fn):
        self.name = name; self.nr = nrings; self.zs = zs; self.radius = radius; self.mask = mask
        self.faces = loft_faces(nrings); self.weights_fn = weights_fn
    def build(self, S):
        zs = self.zs(S); out = []; prev = None
        cys = []
        for k, z in enumerate(zs):
            env, c = envelope(S, self.mask, z)
            r = self.radius(S, k, env, z, prev)
            prev = r
            ring = np.column_stack([c[0] + DIRS[:, 0] * r, c[1] + DIRS[:, 1] * r, np.full(N_AROUND, z)])
            out.append(ring)
        return np.vstack(out)

# ---------------------------------------------------------------- head shells (hair caps, kufi, headwrap)
NLAT, NLON = 16, 28
LAT = np.linspace(0.0, math.radians(118), NLAT)        # angle from straight up
LON = np.arange(NLON) * 2 * math.pi / NLON              # 0 = front
def sph(lat, lon): return np.array([math.sin(lat) * math.sin(lon), -math.sin(lat) * math.cos(lon), math.cos(lat)])
SDIR = np.array([sph(LAT[i], LON[j]) if i else np.array([0, 0, 1.0]) for i in range(NLAT) for j in range(NLON)])

def shell_hits(S, centre):
    bvh = S['bvh']; c = Vector(centre); rad = np.zeros(len(SDIR)); ear = np.zeros(len(SDIR), bool); zz = np.zeros(len(SDIR))
    for k, d in enumerate(SDIR):
        loc, n, idx, dist = bvh.ray_cast(c, Vector(d), 0.5)
        if loc is None: rad[k] = 0.09; continue
        rad[k] = dist; zz[k] = loc.z
        ear[k] = any(EARS[v] for v in POLYS[idx])
    return rad, ear, zz

def shell_centre(S): return S['hc'] + np.array([0, 0.0, 0.0])

def grid_smooth(r, it=2, skip=None):
    g = r.reshape(NLAT, NLON).copy()
    for _ in range(it):
        n = g.copy()
        for i in range(1, NLAT):
            for j in range(NLON):
                nb = [g[i, (j - 1) % NLON], g[i, (j + 1) % NLON]]
                if i > 1: nb.append(g[i - 1, j])
                if i < NLAT - 1: nb.append(g[i + 1, j])
                n[i, j] = 0.5 * g[i, j] + 0.5 * np.mean(nb)
        n[0, :] = g[1, :].mean() * 0.5 + g[0, :] * 0.5
        g = n
    return g.ravel()

class Shell(Garment):
    """Head shell: rays from the head centre to the body surface, + ease(dir, S). keep(dir, z_hit, ear, S) decides coverage on the base body."""
    def __init__(self, name, keep, ease, post=None, S0=None, smooth=2):
        self.name = name; self.ease = ease; self.post = post; self.smooth = smooth
        rad, ear, zz = shell_hits(S0, shell_centre(S0))
        kv = np.array([keep(SDIR[k], zz[k], ear[k], S0, k) for k in range(len(SDIR))])
        # grid faces (pole fan + quads), kept when all corners kept
        quads = []
        for j in range(NLON):                             # pole row: every vertex of row 0 is the same point; use vertex 0 as the pole
            jj = (j + 1) % NLON; quads.append([0, NLON + j, NLON + jj])
        for i in range(1, NLAT - 1):
            for j in range(NLON):
                jj = (j + 1) % NLON
                quads.append([i * NLON + j, (i + 1) * NLON + j, (i + 1) * NLON + jj, i * NLON + jj])
        quads = [q for q in quads if all(kv[v] for v in q)]
        used = sorted(set(v for q in quads for v in q)); rm = {v: i for i, v in enumerate(used)}
        self.sidx = np.array(used); self.faces = [[rm[v] for v in q] for q in quads]
        hb = BONES.index('Head'); self.weights = np.zeros((len(used), len(BONES))); self.weights[:, hb] = 1
    def build(self, S):
        c = shell_centre(S); rad, ear, zz = shell_hits(S, c)
        rad = grid_smooth(rad, self.smooth)
        e = np.array([self.ease(SDIR[k], S, k) for k in range(len(SDIR))])
        v = c + SDIR * (rad + e)[:, None]
        if self.post: v = self.post(v, S)
        return v[self.sidx]

# ---------------------------------------------------------------- hair strands (braids, locs)
class Strands(Garment):
    def __init__(self, name, roots, radius, length_fn, sides=6, segs=9, S0=None):
        """roots: list of (lat, lon) on the head shell."""
        self.name = name; self.roots = roots; self.radius = radius; self.length_fn = length_fn
        self.sides = sides; self.segs = segs
        faces = []; nper = sides * (segs + 1) + 1
        for s in range(len(roots)):
            b = s * nper
            for k in range(segs):
                for i in range(sides):
                    j = (i + 1) % sides
                    faces.append([b + k * sides + i, b + k * sides + j, b + (k + 1) * sides + j, b + (k + 1) * sides + i])
            tip = b + nper - 1
            for i in range(sides):
                j = (i + 1) % sides; faces.append([b + segs * sides + i, b + segs * sides + j, tip])
        self.faces = faces
        # weights: head at the root, blending to Neck1/Spine1 toward the tip
        hb, nb, sb = BONES.index('Head'), BONES.index('Neck1'), BONES.index('Spine1')
        w = []
        for s in range(len(roots)):
            for k in range(segs + 1):
                t = k / segs; row = np.zeros(len(BONES)); row[hb] = 1 - 0.6 * t; row[nb] = 0.35 * t; row[sb] = 0.25 * t
                row /= row.sum(); w += [row] * sides
            w.append(row)
        self.weights = np.array(w)
    def path(self, S, lat, lon):
        c = shell_centre(S); d = sph(lat, lon)
        loc, n, idx, dist = S['bvh'].ray_cast(Vector(c), Vector(d), 0.5)
        root = c + d * ((dist if loc else 0.09) + 0.006)
        L, back = self.length_fn(lat, lon, S)
        hr = 0.105                                        # keep strands outside the head
        horiz = np.array([d[0], d[1], 0.0]); hl = np.linalg.norm(horiz); horiz = horiz / hl if hl > 1e-6 else np.array([0, 1.0, 0])
        pts = []
        for k in range(self.segs + 1):
            t = k / self.segs
            # out from the scalp, then down; pushed back for long strands so they fall behind the shoulders
            out = root + d * 0.018 * min(1, t * 4)
            drop = L * t
            p = out.copy(); p[2] -= drop
            rr = np.hypot(p[0] - c[0], p[1] - c[1])
            need = hr + 0.01 + 0.03 * t
            if p[2] < c[2] + 0.06 and rr < need:
                p[:2] = c[:2] + horiz[:2] * need
            p[1] += back * t * t
            pts.append(p)
        return np.array(pts)
    def build(self, S):
        out = []
        for (lat, lon) in self.roots:
            pts = self.path(S, lat, lon)
            for k in range(self.segs + 1):
                a = pts[min(k + 1, self.segs)] - pts[max(k - 1, 0)]; a /= np.linalg.norm(a) + 1e-9
                ref = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
                e1 = np.cross(a, ref); e1 /= np.linalg.norm(e1); e2 = np.cross(a, e1)
                r = self.radius * (1 - 0.35 * (k / self.segs))
                for i in range(self.sides):
                    ang = 2 * math.pi * i / self.sides
                    out.append(pts[k] + (e1 * math.cos(ang) + e2 * math.sin(ang)) * r)
            out.append(pts[-1] + (pts[-1] - pts[-2]) * 0.3)
        return np.array(out)

# ---------------------------------------------------------------- sleeves (bell sleeves of the boubou)
class Sleeve(Garment):
    """Wide, round boubou sleeve: hugs the shoulder, opens smoothly toward the wrist (no flap)."""
    def __init__(self, name, side, nrings=10, bell=0.125):
        self.name = name; self.side = side; self.nr = nrings; self.bell = bell; self.n = 16
        f = []
        for k in range(nrings - 1):
            for i in range(self.n):
                j = (i + 1) % self.n
                f.append([k * self.n + i, k * self.n + j, (k + 1) * self.n + j, (k + 1) * self.n + i])
        self.faces = f
        L = 'Left' if side > 0 else 'Right'
        sp, sh, ar, fa = BONES.index('Spine1'), BONES.index(L + 'Shoulder'), BONES.index(L + 'Arm'), BONES.index(L + 'ForeArm')
        w = []
        for k in range(nrings):
            s = k / (nrings - 1); row = np.zeros(len(BONES))
            if s < 0.15: t = s / 0.15; row[sp] = 0.3 * (1 - t); row[sh] = 0.7 * (1 - t); row[ar] = t
            elif s < 0.38: row[ar] = 1
            elif s < 0.62: t = (s - 0.38) / 0.24; row[ar] = 1 - t; row[fa] = t
            else: row[fa] = 1
            w += [row] * self.n
        self.weights = np.array(w)
    def build(self, S):
        L = 'Left' if self.side > 0 else 'Right'; J = S['J']
        p0 = J[L + 'Arm'] + np.array([-0.03 * self.side, 0, 0.025]); p1 = J[L + 'ForeArm']; p2 = J[L + 'Hand']
        p2 = p2 + (p2 - p1) / np.linalg.norm(p2 - p1) * 0.015
        l1 = np.linalg.norm(p1 - p0); l2 = np.linalg.norm(p2 - p1)
        armmask = inset({L + 'Arm', L + 'ForeArm'})
        out = []
        for k in range(self.nr):
            s = k / (self.nr - 1); d = s * (l1 + l2)
            if d <= l1: p = p0 + (p1 - p0) * (d / l1); t = (p1 - p0) / l1
            else: p = p1 + (p2 - p1) * ((d - l1) / l2); t = (p2 - p1) / l2
            rel = S['co'][armmask] - p; ax = rel @ t; near = np.abs(ax) < 0.05
            rad = np.linalg.norm(rel[near] - np.outer(ax[near], t), axis=1).max() if near.any() else 0.05
            r = max(rad + 0.016, 0.07 + (self.bell - 0.07) * s * s)
            e1 = np.cross(t, np.array([0, 0, 1.0])); e1 /= np.linalg.norm(e1); e2 = np.cross(e1, t)
            if e2[2] < 0: e2 = -e2
            c = p - e2 * (r - rad - 0.016) * 0.35          # a little slack under the arm
            for i in range(self.n):
                a = 2 * math.pi * i / self.n
                out.append(c + (e1 * math.cos(a) + e2 * math.sin(a)) * r)
        return np.array(out)

# ---------------------------------------------------------------- weights for tubes by height bands
def tube_weights(nrings, zs0, legs_max, hips_z, hem_z):
    """Above the hips: Hips/LowerBack; below: blend toward the same-side thigh, the centre front/back split."""
    hb, lb = BONES.index('Hips'), BONES.index('LowerBack')
    ll, rl = BONES.index('LeftUpLeg'), BONES.index('RightUpLeg')
    w = []
    for k in range(nrings):
        z = zs0[k]
        lw = legs_max * float(smooth01(hips_z, hem_z, z)) if z < hips_z else 0.0
        for i in range(N_AROUND):
            x = DIRS[i, 0]; row = np.zeros(len(BONES))
            if z > hips_z + 0.08: row[lb] = 1.0
            else: row[hb] = 1 - lw
            side = float(np.clip(0.5 + x * 1.2, 0, 1))
            row[ll] += lw * side; row[rl] += lw * (1 - side)
            w.append(row / row.sum())
    return np.array(w)

def knn_weights(verts, S0, mask, k=4):
    co = S0['co']; idx = np.where(mask)[0]; out = []
    for v in verts:
        d = np.linalg.norm(co[idx] - v, axis=1); o = np.argsort(d)[:k]
        ww = 1 / (d[o] + 1e-4); row = (BW[idx[o]] * ww[:, None]).sum(0); out.append(row / row.sum())
    return np.array(out)

# ---------------------------------------------------------------- head caps with a clean edge: per-column latitude
class Cap(Garment):
    """Cap over the head from the crown down to cut(d) (a height per direction), rows re-spaced per column so the edge is smooth."""
    def __init__(self, name, cut, ease, post=None, S0=None, rows=9, smooth=2, stop_ears=True, ncol=28):
        self.name = name; self.ease = ease; self.post = post; self.smooth = smooth; self.rows = rows; self.ncol = ncol
        c = Vector(shell_centre(S0)); bvh = S0['bvh']; lons = np.arange(ncol) * 2 * math.pi / ncol
        latmax = []
        for lon in lons:
            last = math.radians(10)
            for deg in np.arange(10, 130, 1.0):
                d = sph(math.radians(deg), lon); loc, n, idx, dist = bvh.ray_cast(c, Vector(d), 0.5)
                if loc is None: break
                if loc.z < cut(d) or (stop_ears and any(EARS[v] for v in POLYS[idx])): break
                last = math.radians(deg)
            latmax.append(last)
        lm = np.array(latmax)
        for _ in range(2): lm = 0.5 * lm + 0.25 * (np.roll(lm, 1) + np.roll(lm, -1))
        self.dirs = [np.array([0, 0, 1.0])]
        for i in range(1, rows):
            for j in range(ncol): self.dirs.append(sph(lm[j] * i / (rows - 1), lons[j]))
        self.dirs = np.array(self.dirs)
        f = [[0, 1 + j, 1 + (j + 1) % ncol] for j in range(ncol)]
        for i in range(1, rows - 1):
            for j in range(ncol):
                jj = (j + 1) % ncol; a = 1 + (i - 1) * ncol
                f.append([a + j, a + ncol + j, a + ncol + jj, a + jj])
        self.faces = f
        self.weights = np.zeros((len(self.dirs), len(BONES))); self.weights[:, BONES.index('Head')] = 1
    def build(self, S):
        c = shell_centre(S); bvh = S['bvh']; rad = []
        for d in self.dirs:
            loc, n, idx, dist = bvh.ray_cast(Vector(c), Vector(d), 0.5); rad.append(dist if loc else 0.09)
        rad = np.array(rad)
        g = rad[1:].reshape(self.rows - 1, self.ncol)
        for _ in range(self.smooth):
            g = 0.5 * g + 0.25 * (np.roll(g, 1, 1) + np.roll(g, -1, 1))
        rad = np.concatenate([[rad[0]], g.ravel()])
        e = np.array([self.ease(d, S, k) for k, d in enumerate(self.dirs)])
        v = c + self.dirs * (rad + e)[:, None]
        return self.post(v, S, self) if self.post else v


def smooth_neck(v, S, g, front_z, back_z, off=0.012, reach=0.11):
    """Boundary vertices above the shoulders slide onto a smooth neckline (front_z at the front, back_z at the back)."""
    J = S['J']; cy = J['Neck'][1]; top = J['LeftArm'][2] + 0.02; bvh = S['bvh']
    v = v.copy()
    for i in np.where(g.bnd)[0]:
        if v[i, 2] < top or math.hypot(v[i, 0], v[i, 1] - cy) > reach: continue
        th = math.atan2(v[i, 0], -(v[i, 1] - cy)); zt = back_z + (front_z - back_z) * (1 + math.cos(th)) / 2
        d = Vector((math.sin(th), -math.cos(th), 0.0)); o = Vector((0.0, cy, zt))
        loc, n, idx, dist = bvh.ray_cast(o, d, 0.3)
        if loc is not None and dist < reach: v[i] = np.array(loc) + np.array(d) * off
    return v

def tube_weights2(nrings, zs0, hips_z, knee_z, hem_z, front_max=0.9, back_max=0.45):
    """Robe/skirt: below the hips the front follows the thighs and, under the knee, the shins (so it drapes when seated);
    the back follows less. Left/right by side, the centre splits."""
    hb, lb = BONES.index('Hips'), BONES.index('LowerBack')
    lu, ru, ll, rl = BONES.index('LeftUpLeg'), BONES.index('RightUpLeg'), BONES.index('LeftLeg'), BONES.index('RightLeg')
    w = []
    for k in range(nrings):
        z = zs0[k]
        for i in range(N_AROUND):
            x, yf = DIRS[i, 0], -DIRS[i, 1]                 # yf = 1 at the front
            front = float(np.clip(0.5 + yf * 0.8, 0, 1))
            lw = (back_max + (front_max - back_max) * front) * float(smooth01(hips_z + 0.02, (hips_z + knee_z) / 2, z)) if z < hips_z + 0.02 else 0.0
            shin = float(smooth01(knee_z + 0.04, knee_z - 0.12, z)) * front
            row = np.zeros(len(BONES))
            if z > hips_z + 0.08: row[lb] = 1.0
            else: row[hb] = 1 - lw
            side = float(np.clip(0.5 + x * 1.2, 0, 1))
            row[lu] += lw * (1 - shin) * side; row[ru] += lw * (1 - shin) * (1 - side)
            row[ll] += lw * shin * side; row[rl] += lw * shin * (1 - side)
            w.append(row / row.sum())
    return np.array(w)
