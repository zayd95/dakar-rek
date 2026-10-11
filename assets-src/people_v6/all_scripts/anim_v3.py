# Mocap -> game rig (cmu_mb) retargeting by bone direction matching, with loop closure.
import bpy, math, os, numpy as np
from mathutils import Matrix, Quaternion, Vector

TGT = bpy.data.objects['Human.rig']
MOCAP = os.path.expanduser('~/DakarRek-assets/mocap_cmu/')

def fcurves(act):
    out = []
    try: out = list(act.fcurves)
    except Exception: pass
    if out: return out
    for L in act.layers:
        for s in L.strips:
            for cb in s.channelbags: out += list(cb.fcurves)
    return out

def order(arm):
    out = []
    def rec(b):
        out.append(b.name)
        for c in b.children: rec(c)
    for b in arm.data.bones:
        if b.parent is None: rec(b)
    return out

def frame_q(right, up):
    z = up.normalized(); x = (right - z * right.dot(z)).normalized(); y = z.cross(x)
    return Matrix((x, y, z)).transposed().to_quaternion()

class Src:
    """A source armature + an action + names of the joints that define its hips frame."""
    def __init__(self, ob, act, lthigh='LeftUpLeg', rthigh='RightUpLeg', spine='Spine', hips='Hips', head='Head'):
        self.ob = ob; self.act = act; self.l = lthigh; self.r = rthigh; self.s = spine; self.h = hips; self.head = head
    def use(self):
        ad = self.ob.animation_data or self.ob.animation_data_create(); ad.action = self.act
        try:
            if ad.action_suitable_slots: ad.action_slot = ad.action_suitable_slots[0]
        except Exception: pass
    def P(self, n): return self.ob.matrix_world @ self.ob.pose.bones[n].head
    def frame(self):
        up = self.P(self.s) - self.P(self.h)
        if up.length < 1e-5: up = Vector((0, 0, 1))
        return frame_q(self.P(self.r) - self.P(self.l), up)
    def dir(self, n):
        pb = self.ob.pose.bones[n]; return self.ob.matrix_world.to_3x3() @ (pb.tail - pb.head)
    def rest_hips_z(self):
        b = self.ob.data.bones; return (self.ob.matrix_world @ b[self.h].head_local).z
    def size(self):
        b = self.ob.data.bones; mw = self.ob.matrix_world
        return (mw @ b[self.head].tail_local - mw @ b[self.h].head_local).length

def import_bvh(name):
    ob = bpy.data.objects.get('bvh_' + name)
    if ob: return Src(ob, ob.animation_data.action)
    before = set(bpy.data.objects.keys())
    bpy.ops.import_anim.bvh(filepath=MOCAP + name + '.bvh', axis_forward='-Z', axis_up='Y', use_fps_scale=True,
                            update_scene_fps=False, update_scene_duration=False)
    ob = [bpy.data.objects[k] for k in set(bpy.data.objects.keys()) - before][0]
    ob.name = 'bvh_' + name; ob.hide_set(True)
    return Src(ob, ob.animation_data.action)

def tgt_frame(pose):
    B = TGT.pose.bones if pose else TGT.data.bones; mw = TGT.matrix_world
    g = (lambda n: mw @ B[n].head) if pose else (lambda n: mw @ B[n].head_local)
    return frame_q(g('RightUpLeg') - g('LeftUpLeg'), g('Spine') - g('Hips'))

def facing_yaw(src, f0, f1):
    sc = bpy.context.scene; src.use(); v = Vector((0, 0, 0))
    for f in range(f0, f1 + 1, max(1, (f1 - f0) // 8)):
        sc.frame_set(f); fq = src.frame(); v += fq @ Vector((0, 1, 0))
    tq = tgt_frame(False); tv = tq @ Vector((0, 1, 0))
    return math.atan2(tv.y, tv.x) - math.atan2(v.y, v.x)

TWIST = {'LowerBack', 'Spine', 'Spine1', 'Neck', 'Neck1', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg'}

def twist_of(pb):
    """Rotation of a pose bone about its own axis (local Y), relative to its rest."""
    q = pb.matrix_basis.to_quaternion()
    a = 2 * math.atan2(q.y, q.w)
    return math.atan2(math.sin(a), math.cos(a))

SPEED = {}

def retarget(name, srcs, f0, n, mapping=None, upper=None, in_place=True, abs_height=False, loop=True, yaw=None, blend=6, ground=0.0, twist=True, adduct=0.0):
    """srcs: main Src (and optional upper-body Src with its own start frame: upper=(Src, f0u, bones)).
    mapping: target bone -> source bone (default same names)."""
    sc = bpy.context.scene; tgt = TGT; tmw = tgt.matrix_world
    mapping = mapping or {}
    main = srcs
    if yaw is None: yaw = facing_yaw(main, f0, f0 + n)
    Y = Quaternion((0, 0, 1), yaw)
    scale = (tmw @ tgt.data.bones['Head'].tail_local - tmw @ tgt.data.bones['Hips'].head_local).length / main.size()
    act = bpy.data.actions.get(name)
    if act: bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name); act.use_fake_user = True
    ad = tgt.animation_data or tgt.animation_data_create(); ad.action = act
    try:
        if not ad.action_suitable_slots: act.slots.new('OBJECT', tgt.name)
        ad.action_slot = ad.action_suitable_slots[0]
    except Exception as e: print('slot', e)
    for pb in tgt.pose.bones: pb.rotation_mode = 'QUATERNION'
    t_rest = tgt_frame(False); hips_rest = tmw @ tgt.data.bones['Hips'].head_local
    names = order(tgt)
    main.use(); sc.frame_set(f0); h0 = main.P(main.h).copy()
    ref_z = main.rest_hips_z() if abs_height else h0.z
    ub = set(upper[2]) if upper else set()
    Yu = Quaternion((0, 0, 1), facing_yaw(upper[0], upper[1], upper[1] + n)) if upper else Y
    for k in range(n + 1):
        f = f0 + k
        main.use(); sc.frame_set(f)
        dirs = {}; tw = {}
        for tn in names:
            sn = mapping.get(tn, tn)
            if sn and sn in main.ob.pose.bones:
                dirs[tn] = Y.to_matrix() @ main.dir(sn)
                if twist and tn in TWIST: tw[tn] = twist_of(main.ob.pose.bones[sn])
        hq = Y @ main.frame(); hw = main.P(main.h)
        if upper:
            us, uf0, _ = upper; us.use(); sc.frame_set(uf0 + k)
            for tn in ub:
                sn = mapping.get(tn, tn)
                if sn in us.ob.pose.bones:
                    dirs[tn] = Yu.to_matrix() @ us.dir(sn)
                    if twist and tn in TWIST: tw[tn] = twist_of(us.ob.pose.bones[sn])
            main.use(); sc.frame_set(f)
        for pb in tgt.pose.bones: pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0)
        bpy.context.view_layer.update()
        for tn in names:
            tpb = tgt.pose.bones[tn]; tb = tgt.data.bones[tn]
            if tn == 'Hips':
                qw = hq @ t_rest.inverted() @ (tmw @ tb.matrix_local).to_quaternion()
                d = (Y @ (hw - h0)) * scale
                if in_place: d.x = 0; d.y = 0
                headw = hips_rest + Vector((d.x, d.y, (hw.z - ref_z) * scale))
                if abs_height: headw.z = hw.z * scale + ground
            else:
                restw = (tmw @ tpb.parent.matrix) @ (tb.parent.matrix_local.inverted() @ tb.matrix_local)
                qw = restw.to_quaternion(); headw = restw.to_translation()
                ds = dirs.get(tn)
                if ds is not None and ds.length > 1e-4:
                    ds = ds.normalized()
                    if adduct and tn in ('LeftArm', 'RightArm'):        # hanging arms closer to the body
                        down = min(1.0, max(0.0, (-ds.z - 0.4) / 0.5))
                        ds = Vector((ds.x * (1 - adduct * down), ds.y, ds.z)).normalized()
                    d0 = restw.to_3x3() @ Vector((0, 1, 0))
                    qw = d0.normalized().rotation_difference(ds) @ qw
                    if tn in tw: qw = Quaternion(ds, tw[tn]) @ qw
            tpb.matrix = tmw.inverted() @ Matrix.LocRotScale(headw, qw, Vector((1, 1, 1)))
            bpy.context.view_layer.update()
        for tn in names:
            tpb = tgt.pose.bones[tn]; tpb.keyframe_insert('rotation_quaternion', frame=k + 1)
            if tn == 'Hips': tpb.keyframe_insert('location', frame=k + 1)
    main.use(); sc.frame_set(f0); a0 = main.P(main.h).copy(); sc.frame_set(f0 + n); a1 = main.P(main.h).copy()
    SPEED[name] = round(math.hypot(a1.x - a0.x, a1.y - a0.y) * scale / (n / bpy.context.scene.render.fps), 3)
    if loop: close_loop(act, blend)
    return act

def close_loop(act, blend=6):
    """Make the last key equal the first, spreading the difference over the last `blend` keys; quaternion signs kept continuous."""
    groups = {}
    for fc in fcurves(act): groups.setdefault(fc.data_path, {})[fc.array_index] = fc
    for path, g in groups.items():
        idx = sorted(g); vals = np.array([[kp.co[1] for kp in g[i].keyframe_points] for i in idx])  # comps x keys
        if 'quaternion' in path and vals.shape[0] == 4:
            for k in range(1, vals.shape[1]):
                if np.dot(vals[:, k], vals[:, k - 1]) < 0: vals[:, k] *= -1
            if np.dot(vals[:, -1], vals[:, 0]) < 0: vals[:, 0:] *= 1   # signs already continuous
        n = vals.shape[1]; diff = vals[:, 0] - vals[:, -1]
        for k in range(max(0, n - blend), n):
            t = (k - (n - blend - 1)) / blend; t = t * t * (3 - 2 * t)
            vals[:, k] += diff * t
        if 'quaternion' in path and vals.shape[0] == 4: vals /= np.linalg.norm(vals, axis=0, keepdims=True)
        for row, i in enumerate(idx):
            for k, kp in enumerate(g[i].keyframe_points):
                kp.co[1] = vals[row, k]; kp.handle_left[1] = vals[row, k]; kp.handle_right[1] = vals[row, k]
            g[i].update()

UPPER = ['LowerBack', 'Spine', 'Spine1', 'Neck', 'Neck1', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LThumb',
         'LeftFingerBase', 'LeftHandFinger1', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RThumb', 'RightFingerBase', 'RightHandFinger1']

def aim(pb, target_dir):
    mw = TGT.matrix_world; inv = mw.inverted()
    cur = mw.to_3x3() @ (pb.tail - pb.head); q = cur.normalized().rotation_difference(target_dir.normalized())
    W = mw @ pb.matrix; pb.matrix = inv @ Matrix.LocRotScale(W.to_translation(), q @ W.to_quaternion(), Vector((1, 1, 1))); bpy.context.view_layer.update()

def use_action(name):
    ad = TGT.animation_data or TGT.animation_data_create(); ad.action = bpy.data.actions[name]
    try: ad.action_slot = ad.action_suitable_slots[0]
    except Exception: pass

def ground_fix(name):
    use_action(name); sc = bpy.context.scene; act = bpy.data.actions[name]; f0, f1 = map(int, act.frame_range); mw = TGT.matrix_world
    rest = min((mw @ TGT.data.bones[b].head_local).z for b in ('LeftFoot', 'RightFoot')); offs = []
    for f in range(f0, f1 + 1, 4):
        sc.frame_set(f); offs.append(min((mw @ TGT.pose.bones[b].head).z for b in ('LeftFoot', 'RightFoot')) - rest)
    off = float(np.mean(offs)); R = (mw @ TGT.data.bones['Hips'].matrix_local).to_3x3().inverted(); loc = R @ Vector((0, 0, -off))
    for fc in fcurves(act):
        if fc.data_path.endswith('"Hips"].location'):
            for kp in fc.keyframe_points:
                for at in ('co', 'handle_left', 'handle_right'): getattr(kp, at)[1] += loc[fc.array_index]
            fc.update()
    return off

def seat_drop(name, drop):
    """Lower the seated hips by `drop` and keep the feet where they were (two-bone IK on the legs)."""
    use_action(name); act = bpy.data.actions[name]; f0, f1 = map(int, act.frame_range)
    sc = bpy.context.scene; mw = TGT.matrix_world; PB = TGT.pose.bones
    R = (mw @ TGT.data.bones['Hips'].matrix_local).to_3x3().inverted()
    for f in range(f0, f1 + 1):
        sc.frame_set(f); rec = {}
        for s in ('Left', 'Right'):
            rec[s] = ((mw @ PB[s + 'Foot'].head).copy(), (mw @ PB[s + 'Leg'].head).copy(), (mw.to_3x3() @ (PB[s + 'Foot'].tail - PB[s + 'Foot'].head)).copy(), (mw.to_3x3() @ (PB[s + 'ToeBase'].tail - PB[s + 'ToeBase'].head)).copy())
        PB['Hips'].location = PB['Hips'].location + R @ Vector((0, 0, -drop)); bpy.context.view_layer.update()
        for s in ('Left', 'Right'):
            A, Kold, fdir, tdir = rec[s]; up = PB[s + 'UpLeg']; lo = PB[s + 'Leg']
            H = mw @ up.head; L1 = (up.tail - up.head).length; L2 = (lo.tail - lo.head).length
            d = A - H; dl = min(d.length, L1 + L2 - 1e-4); dn = d.normalized()
            pole = (Kold - H); pole = (pole - dn * pole.dot(dn)).normalized()
            pole = (pole + Vector((0, -0.6, 0.4))).normalized(); pole = (pole - dn * pole.dot(dn)).normalized()
            a_ = (L1 * L1 + dl * dl - L2 * L2) / (2 * dl); h = math.sqrt(max(L1 * L1 - a_ * a_, 0)); K = H + dn * a_ + pole * h
            aim(up, K - H); aim(lo, A - K); aim(PB[s + 'Foot'], fdir); aim(PB[s + 'ToeBase'], tdir)
        for bn in ('Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'):
            PB[bn].keyframe_insert('rotation_quaternion', frame=f)
        PB['Hips'].keyframe_insert('location', frame=f)

def phone_ik():
    """Left hand held at the left ear (the capture's proportions put it on top of the head)."""
    use_action('Phone'); act = bpy.data.actions['Phone']; f0, f1 = map(int, act.frame_range)
    sc = bpy.context.scene; mw = TGT.matrix_world; PB = TGT.pose.bones
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        hm = mw @ PB['Head'].matrix; hy = (hm.to_3x3() @ Vector((0, 1, 0))).normalized(); hp = hm.to_translation()
        ear = hp + hy * 0.075 + Vector((0.085, 0, 0)); W = ear + Vector((0.02, -0.01, -0.105))
        S = mw @ PB['LeftArm'].head; L1 = (PB['LeftArm'].tail - PB['LeftArm'].head).length; L2 = (PB['LeftForeArm'].tail - PB['LeftForeArm'].head).length
        d = W - S; dl = min(d.length, L1 + L2 - 1e-4); dn = d.normalized()
        pole = Vector((0.55, -0.35, -0.75)); pole = (pole - dn * pole.dot(dn)).normalized()
        a_ = (L1 * L1 + dl * dl - L2 * L2) / (2 * dl); h = math.sqrt(max(L1 * L1 - a_ * a_, 0)); K = S + dn * a_ + pole * h
        aim(PB['LeftArm'], K - S); aim(PB['LeftForeArm'], W - K); aim(PB['LeftHand'], Vector((-0.15, -0.25, 1.0)))
        for bn in ('LeftArm', 'LeftForeArm', 'LeftHand'): PB[bn].keyframe_insert('rotation_quaternion', frame=f)

GAME_CLIPS = ['Walk', 'Run', 'Idle', 'Idle_B', 'Talk', 'Phone', 'Sit', 'Eat', 'Wave', 'Celebrate', 'Dance_A', 'Dance_B', 'Entrance_Walk', 'Fall_Back', 'Grab', 'Prep', 'Stance']

def make_nla():
    ad = TGT.animation_data or TGT.animation_data_create()
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for c in GAME_CLIPS:
        a = bpy.data.actions.get(c)
        if not a: continue
        tr = ad.nla_tracks.new(); tr.name = c; st = tr.strips.new(c, int(a.frame_range[0]), a); tr.mute = True
        try: st.action_slot = a.slots[0]
        except Exception: pass
    ad.action = None
    return [t.name for t in ad.nla_tracks]

def bake_mocap():
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_viewport = True
    try:
        B = import_bvh; ad = 0.35
        retarget('Walk', B('93_07'), 20, 33, adduct=ad)
        retarget('Run', B('09_01'), 3, 22, adduct=0.15)
        retarget('Idle', B('18_08'), 130, 102, adduct=ad)
        retarget('Idle_B', B('40_10'), 32, 106, adduct=ad)
        retarget('Talk', B('18_08'), 298, 120, adduct=0.2)
        retarget('Phone', B('80_25'), 98, 110, adduct=ad)
        retarget('Sit', B('114_05'), 6, 156, abs_height=True, adduct=0.2)
        retarget('Eat', B('114_05'), 6, 124, abs_height=True, upper=(B('79_15'), 64, UPPER))
        retarget('Wave', B('13_26'), 630, 40)
        for n in ('Sit', 'Eat'): ground_fix(n); seat_drop(n, 0.16)
        phone_ik()
    finally:
        for o in bpy.data.objects:
            if o.type == 'MESH': o.hide_viewport = False
    return dict(SPEED), make_nla()
