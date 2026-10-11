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

def retarget(name, srcs, f0, n, mapping=None, upper=None, in_place=True, abs_height=False, loop=True, yaw=None, blend=6):
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
        dirs = {}
        for tn in names:
            sn = mapping.get(tn, tn)
            if sn and sn in main.ob.pose.bones: dirs[tn] = Y.to_matrix() @ main.dir(sn)
        hq = Y @ main.frame(); hw = main.P(main.h)
        if upper:
            us, uf0, _ = upper; us.use(); sc.frame_set(uf0 + k)
            for tn in ub:
                sn = mapping.get(tn, tn)
                if sn in us.ob.pose.bones: dirs[tn] = Yu.to_matrix() @ us.dir(sn)
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
            else:
                restw = (tmw @ tpb.parent.matrix) @ (tb.parent.matrix_local.inverted() @ tb.matrix_local)
                qw = restw.to_quaternion(); headw = restw.to_translation()
                ds = dirs.get(tn)
                if ds is not None and ds.length > 1e-4:
                    d0 = restw.to_3x3() @ Vector((0, 1, 0))
                    qw = d0.normalized().rotation_difference(ds.normalized()) @ qw
            tpb.matrix = tmw.inverted() @ Matrix.LocRotScale(headw, qw, Vector((1, 1, 1)))
            bpy.context.view_layer.update()
        for tn in names:
            tpb = tgt.pose.bones[tn]; tpb.keyframe_insert('rotation_quaternion', frame=k + 1)
            if tn == 'Hips': tpb.keyframe_insert('location', frame=k + 1)
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

def bake_mocap():
    out = {}
    out['Walk'] = retarget('Walk', import_bvh('93_07'), 20, 33)
    out['Run'] = retarget('Run', import_bvh('09_01'), 3, 22)
    out['Idle'] = retarget('Idle', import_bvh('18_08'), 130, 102)
    out['Talk'] = retarget('Talk', import_bvh('18_08'), 298, 120)
    out['Phone'] = retarget('Phone', import_bvh('80_25'), 98, 110)
    out['Sit'] = retarget('Sit', import_bvh('86_15'), 550, 160, abs_height=True)
    out['Eat'] = retarget('Eat', import_bvh('86_15'), 550, 124, abs_height=True, upper=(import_bvh('79_15'), 64, UPPER))
    out['Wave'] = retarget('Wave', import_bvh('13_26'), 630, 40)
    return {k: (v.name, v.frame_range[:]) for k, v in out.items()}
