# Session helpers for people_mpfb_v1.blend: exec this file, then use bpy.app.driver_namespace['rebuild'](...) etc.
import bpy, os, time, numpy as np
D = os.path.expanduser('~/DakarRek-assets/scripts/')
NSP = bpy.app.driver_namespace

def setk(vals):
    for o in bpy.data.collections['Game'].objects:
        ks = o.data.shape_keys if o.type == 'MESH' else None
        if not ks: continue
        for kb in ks.key_blocks[1:]: kb.value = vals.get(kb.name, 0.0)

def show(names):
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_set(o.name not in names); o.hide_render = o.name not in names

def play(name):
    rig = bpy.data.objects['Human.rig']; ad = rig.animation_data or rig.animation_data_create()
    ad.action = bpy.data.actions[name]
    try: ad.action_slot = ad.action_suitable_slots[0]
    except Exception: pass
    sc = bpy.context.scene; sc.frame_start = 1; sc.frame_end = int(ad.action.frame_range[1])

def blink_key():
    def co_basis(o):
        kb = o.data.shape_keys.key_blocks['Basis']; a = np.empty(len(kb.data) * 3); kb.data.foreach_get('co', a); return a.reshape(-1, 3)
    E = co_basis(bpy.data.objects['Eyes'])
    for o in ('Body', 'Lashes'):
        ob = bpy.data.objects[o]; v = co_basis(ob); out = v.copy()
        for side in (1, -1):
            e = E[E[:, 0] * side > 0]; c = e.mean(0); R = np.linalg.norm(e - c, axis=1).max()
            d = np.hypot(v[:, 0] - c[0], v[:, 2] - c[2])
            sel = (v[:, 0] * side > 0) & (d < 0.03) & (v[:, 1] < c[1] + 0.004) & (v[:, 2] > c[2] - 0.001)
            w = np.clip((0.028 - d) / (0.028 - 0.014), 0, 1); w = w * w * (3 - 2 * w)
            for i in np.where(sel)[0]:
                tz = c[2] - 0.0065 + (v[i, 2] - c[2]) * 0.1; nz = v[i, 2] + (tz - v[i, 2]) * w[i]
                dx = v[i, 0] - c[0]; dz = nz - c[2]; r2 = R * R - dx * dx - dz * dz; ny = v[i, 1]
                if r2 > 0 and w[i] > 0.5: ny = min(ny, c[1] - np.sqrt(r2) - 0.0015)
                out[i] = (v[i, 0], ny, nz)
        kb = ob.data.shape_keys.key_blocks.get('Blink') or ob.shape_key_add(name='Blink', from_mix=False)
        kb.data.foreach_set('co', out.ravel())

def bake_ao(samples=24):
    sc = bpy.context.scene; old = sc.render.engine; sc.render.engine = 'CYCLES'; sc.cycles.samples = samples
    try: sc.cycles.device = 'CPU'
    except Exception: pass
    sc.render.bake.target = 'VERTEX_COLORS'
    rig = bpy.data.objects['Human.rig']; rig.data.pose_position = 'REST'; setk({})
    game = [o for o in bpy.data.collections['Game'].objects if o.type == 'MESH']
    allm = [o for o in bpy.data.objects if o.type == 'MESH']; body = bpy.data.objects['Body']; t = time.time()
    for tgt in game:
        ca = tgt.data.color_attributes.get('AO') or tgt.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
        tgt.data.color_attributes.active_color = ca
        try: tgt.data.color_attributes.render_color_index = tgt.data.color_attributes.active_color_index
        except Exception: pass
        if tgt.name in ('Eyes', 'Brows', 'Lashes'): ca.data.foreach_set('color', [1.0] * (4 * len(ca.data))); continue
        for o in allm:
            vis = o == tgt or (o == body and tgt != body); o.hide_render = not vis; o.hide_set(not vis)
        bpy.ops.object.select_all(action='DESELECT'); tgt.select_set(True); bpy.context.view_layer.objects.active = tgt
        bpy.ops.object.bake(type='AO')
    for o in game: o.hide_render = False; o.hide_set(False)
    sc.render.engine = old
    return round(time.time() - t, 1)

def export_v6():
    rig = bpy.data.objects['Human.rig']; rig.data.pose_position = 'POSE'
    if rig.animation_data: rig.animation_data.action = None
    setk({}); bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.collections['Game'].objects: o.hide_set(False); o.hide_viewport = False; o.select_set(True)
    rig.hide_set(False); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    out = os.path.expanduser('~/DakarRek-assets/character_v6.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_extras=True,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_image_format='NONE', export_skins=True, export_morph=True, export_morph_normal=False,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1,
        export_optimize_animation_size=True, export_def_bones=False, export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True,
        export_lights=False, export_cameras=False)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser('~/DakarRek-assets/people_mpfb_v1.blend'))
    return os.path.getsize(out)

def rebuild(files, ao=True):
    ns = {'__name__': 'garm'}
    for f in files: exec(compile(open(D + f).read(), D + f, 'exec'), ns)
    NSP['NS'] = ns
    rig = bpy.data.objects['Human.rig']; rig.data.pose_position = 'REST'
    ns['assemble'](); ns['morphs']()
    fm = ns['face_morphs']() if 'face_morphs' in ns else []
    blink_key()
    for o in bpy.data.collections['Game'].objects:
        if o.type != 'MESH': continue
        n = {'Body': 'G_Skin', 'Eyes': 'G_Eyes', 'Brows': 'G_Brows', 'Lashes': 'G_Lashes'}.get(o.name, 'G_Hair' if o.name.startswith(('Hair_', 'Beard')) else 'G_Cloth')
        o.data.materials.clear(); o.data.materials.append(bpy.data.materials.get(n) or bpy.data.materials.new(n))
    for m in [m for m in bpy.data.meshes if m.users == 0]: bpy.data.meshes.remove(m)
    t = bake_ao() if ao else 0
    return fm, t, export_v6()

NSP.update(dict(setk=setk, show=show, play=play, blink_key=blink_key, bake_ao=bake_ao, export_v6=export_v6, rebuild=rebuild))
