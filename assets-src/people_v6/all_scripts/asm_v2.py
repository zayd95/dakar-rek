# Assembly: build final game meshes on the base body, then capture phenotype variants as shape keys.
import bpy, json
from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties as HOP
from bl_ext.blender_org.mpfb.services.targetservice import TargetService as TS

HUMAN = bpy.data.objects['Human']
BASE = dict(gender=1.0, age=0.5, muscle=0.6, weight=0.5, proportions=0.6, height=0.46, african=1.0)
MERGE = {'Cloth_Boubou': ['Cloth_Boubou', 'Cloth_Boubou_SleeveL', 'Cloth_Boubou_SleeveR'],
         'Hair_Braids': ['Hair_Short', 'Hair_Braids'], 'Hair_Locs': ['Hair_Short', 'Hair_Locs']}
PROXIES = {'Body': 'male1591', 'Eyes': 'Human.low-poly', 'Brows': 'Human.eyebrow001', 'Lashes': 'Human.eyelashes01'}
COLL = 'Game'

def set_pheno(**kw):
    vals = dict(BASE); vals.update(kw)
    for k, v in vals.items(): HOP.set_value(k, v, entity_reference=HUMAN)
    TS.reapply_macro_details(HUMAN)
    bpy.ops.object.select_all(action='DESELECT'); HUMAN.select_set(True); bpy.context.view_layer.objects.active = HUMAN
    bpy.ops.mpfb.refit_human()

def parts_of(G):
    by = {g.name: g for g in G}; used = set(x for v in MERGE.values() for x in v)
    parts = {n: [by[x] for x in lst] for n, lst in MERGE.items()}
    for g in G:
        if g.name not in used or g.name == 'Hair_Short': parts.setdefault(g.name, [g])
    return parts

def build_parts(parts, S): return {n: np.vstack([g.build(S) for g in lst]) for n, lst in parts.items()}

def proxy_co(name):
    me = bpy.data.objects[name].data; a = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', a); return a.reshape(-1, 3)

def capture(parts):
    S = state(); out = build_parts(parts, S)
    for k, p in PROXIES.items(): out[k] = proxy_co(p)
    joints = {b.name: list(b.head_local) for b in RIG.data.bones}
    return out, joints

def coll():
    c = bpy.data.collections.get(COLL)
    if not c: c = bpy.data.collections.new(COLL); bpy.context.scene.collection.children.link(c)
    return c

def placeholder_mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
    if b: b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.85
    return m

def make_obj(name, verts, faces, weights, mat):
    old = bpy.data.objects.get(name)
    if old: bpy.data.objects.remove(old)
    me = bpy.data.meshes.new(name); me.from_pydata(verts.tolist(), [], faces); me.update()
    ob = bpy.data.objects.new(name, me); coll().objects.link(ob); ob.parent = RIG
    uv = cyl_uv(verts); L = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        li = list(poly.loop_indices); us = [uv[me.loops[l].vertex_index] for l in li]
        lo, hi = min(u[0] for u in us), max(u[0] for u in us)
        for l, u in zip(li, us):
            u = u.copy()
            if hi - lo > 0.5 and u[0] < (lo + hi) / 2: u[0] += 1
            L.data[l].uv = (float(u[0]), float(u[1]))
    for j, b in enumerate(BONES):
        idx = np.where(weights[:, j] > 1e-4)[0]
        if len(idx):
            vg = ob.vertex_groups.new(name=b)
            for i in idx: vg.add([int(i)], float(weights[i, j]), 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = RIG
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(mat)
    return ob

COLORS = {'Cloth_Tee': (0.8, 0.3, 0.2), 'Cloth_Trousers': (0.12, 0.14, 0.2), 'Cloth_Shorts': (0.3, 0.3, 0.35),
          'Cloth_Boubou': (0.85, 0.82, 0.7), 'Cloth_DressTop': (0.6, 0.15, 0.4), 'Cloth_Skirt': (0.6, 0.15, 0.4),
          'Cloth_Kufi': (0.9, 0.9, 0.85), 'Cloth_Headwrap': (0.8, 0.5, 0.1), 'Cloth_Shoes': (0.2, 0.15, 0.1),
          'Ngemb_A': (0.9, 0.9, 0.9), 'Ngemb_B': (0.9, 0.9, 0.9), 'Beard': (0.03, 0.03, 0.03),
          'Hair_Short': (0.03, 0.03, 0.03), 'Hair_Puff': (0.03, 0.03, 0.03), 'Hair_Braids': (0.03, 0.03, 0.03), 'Hair_Locs': (0.04, 0.03, 0.02)}

def assemble():
    set_pheno()
    S0 = state(); G = make_all(S0); parts = parts_of(G)
    base = build_parts(parts, S0); objs = {}
    for n, lst in parts.items():
        faces = []; off = 0; ws = []
        for g in lst:
            faces += [[i + off for i in f] for f in g.faces]; off += len(g.build(S0)); ws.append(g.weights)
        objs[n] = make_obj(n, base[n], faces, np.vstack(ws), placeholder_mat('M_' + n, COLORS.get(n, (0.5, 0.5, 0.5))))
    for k, p in PROXIES.items():
        src = bpy.data.objects[p]; old = bpy.data.objects.get(k)
        if old: bpy.data.objects.remove(old)
        ob = src.copy(); ob.data = src.data.copy(); ob.name = k; ob.data.name = k; coll().objects.link(ob)
        for m in list(ob.modifiers):
            if m.type != 'ARMATURE': ob.modifiers.remove(m)
        objs[k] = ob
    bpy.app.driver_namespace['DR'] = dict(G=G, parts=parts, objs=objs)
    return objs

VARIANTS = [('Female', dict(gender=0.0), None), ('Heavy', dict(weight=1.0), None), ('Muscular', dict(muscle=1.0), None),
            ('Old', dict(age=0.85), None),
            ('HeavyF', dict(gender=0.0, weight=1.0), 'Female'), ('MuscularF', dict(gender=0.0, muscle=1.0), 'Female'),
            ('OldF', dict(gender=0.0, age=0.85), 'Female')]

def morphs():
    st = bpy.app.driver_namespace['DR']; parts, objs = st['parts'], st['objs']
    set_pheno(); base, bj = capture(parts)
    caps = {}; joints = {}
    for name, kw, rel in VARIANTS:
        set_pheno(**kw); caps[name], joints[name] = capture(parts)
    set_pheno()
    for n, ob in objs.items():
        if not ob.data.shape_keys: ob.shape_key_add(name='Basis', from_mix=False)
        for name, kw, rel in VARIANTS:
            ref = base[n] if rel is None else caps[rel][n]
            delta = caps[name][n] - ref if rel else caps[name][n] - base[n]
            target = base[n] + delta
            kb = ob.data.shape_keys.key_blocks.get(name) or ob.shape_key_add(name=name, from_mix=False)
            kb.data.foreach_set('co', target.ravel())
    # bone rest deltas in glTF axes (x, z, -y)
    out = {}
    for name, kw, rel in VARIANTS:
        ref = bj if rel is None else joints[rel]; d = {}
        for b in bj:
            v = np.array(joints[name][b]) - np.array(ref[b])
            if np.abs(v).max() > 1e-4: d[b] = [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]
        out[name] = d
    RIG['morph_bones'] = json.dumps(out)
    return {k: len(v) for k, v in out.items()}
