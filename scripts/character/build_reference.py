"""Build ONE authored reference character from CC0 MakeHuman anatomy. No V4/V6 geometry.
Blender --background --python scripts/character/build_reference.py -- /path/to/repo
Requires installed MPFB; all output goes to the passed repository.
"""
import bpy, bmesh, addon_utils, sys, os, json, math, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = sys.argv[sys.argv.index('--') + 1]
addon_utils.enable('bl_ext.blender_org.mpfb', default_set=False)
from bl_ext.blender_org.mpfb.services.humanservice import HumanService as HS
from bl_ext.blender_org.mpfb.services.targetservice import TargetService as TS
from bl_ext.blender_org.mpfb.services.locationservice import LocationService as LS
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
random.seed(95)
info = TS.get_default_macro_info_dict()
info.update(gender=1., age=.5, muscle=.62, weight=.46, proportions=.75, height=.55)
info['race'] = {'african':.9, 'asian':0., 'caucasian':.1}
human = HS.create_human(macro_detail_dict=info)
targets = {'head/head-rectangular': .28, 'chin/chin-width-incr': .12,
           'chin/chin-prominent-incr': .13, 'nose/nose-width1-decr': .18,
           'mouth/mouth-scale-depth-decr': .12, 'mouth/mouth-angles-up': .14,
           'neck/measure-neck-height-decr': .15}
for target, weight in targets.items():
    TS.load_target(human, os.path.join(LS.get_mpfb_data('targets'), target + '.target.gz'), weight=weight)
rig = HS.add_builtin_rig(human, 'mixamo', import_weights=True)
rig.name = 'Reference_Rig'
tee_source=HS.add_mhclo_asset(os.path.join(ROOT,'assets-src/reference-character/tee-source/elvs_crude_t-shirt_male.mhclo'),
    human,subdiv_levels=0,material_type='NONE',interpolate_weights=True,import_subrig=False,import_weights=False)
# Keep the anatomical mesh available for our own exposed-skin selection and joint helpers.
for mod in list(human.modifiers):
    if mod.name.startswith('Delete.'): human.modifiers.remove(mod)
deps = bpy.context.evaluated_depsgraph_get()
evaluated = human.evaluated_get(deps)
mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=deps)
verts = [v.co.copy() for v in mesh.vertices]
faces = [list(p.vertices) for p in mesh.polygons]
groups = {g.index:g.name for g in human.vertex_groups}
weights = [{groups[g.group]:g.weight for g in v.groups if groups[g.group].startswith('mixamorig:') and g.weight > 1e-5} for v in mesh.vertices]
names = [max(w, key=w.get).split(':')[-1] if w else '' for w in weights]
normals = [v.normal.copy() for v in mesh.vertices]
J = {b.name.split(':')[-1]:b.head_local.copy() for b in rig.data.bones}
scale = 1.78 / max(v.z for v in verts)
# Scale the source anatomy and rest rig together; keep metre units in the exported GLB.
for v in verts: v *= scale
for j in J.values(): j *= scale
bpy.context.view_layer.objects.active=rig; bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones: b.head *= scale; b.tail *= scale
bpy.ops.object.mode_set(mode='OBJECT')
front = min(v.y for v in verts if v.z > J['Neck'].z)
headtop = max(v.z for v in verts)
hip, knee, ankle, neck = (J[n].z for n in ('Hips','LeftLeg','LeftFoot','Neck'))
tree = BVHTree.FromPolygons(verts, faces, all_triangles=False)
objects = []

def linear(hexcolor):
    a = [(hexcolor >> s & 255)/255 for s in (16,8,0)]
    return [c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in a]

material = bpy.data.materials.new('Reference_VertexPalette'); material.use_nodes=True
bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); bsdf.inputs['Base Color'].default_value=(1,1,1,1)
bsdf.inputs['Roughness'].default_value=.85
color=material.node_tree.nodes.new('ShaderNodeVertexColor'); color.layer_name='Color'
material.node_tree.links.new(color.outputs['Color'],bsdf.inputs['Base Color'])

def object_from(name, vs, fs, ws, hexcolor, smooth=False):
    me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.parent=rig
    me.materials.append(material)
    for bn in rig.data.bones:
        vg=o.vertex_groups.new(name=bn.name)
        for i,w in enumerate(ws):
            value=w.get(bn.name,0)
            if value > 1e-5: vg.add([i],value,'REPLACE')
    mod=o.modifiers.new('Reference_Skin','ARMATURE'); mod.object=rig
    for p in me.polygons: p.use_smooth=smooth
    ca=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    rgb=linear(hexcolor)
    for v in me.vertices:
        k=random.uniform(.98,1.02) if smooth else random.uniform(.96,1.04)
        ca.data[v.index].color=(*[min(1,c*k) for c in rgb],1)
    objects.append(o); return o

def piece(name, mask, color, offset=0., smooth=False, ratio=1.):
    fs=[f for f in faces if all(mask(i) for i in f)]
    ids=sorted(set(i for f in fs for i in f)); ix={i:n for n,i in enumerate(ids)}
    vs=[verts[i]+normals[i]*offset for i in ids]
    o=object_from(name,vs,[[ix[i] for i in f] for f in fs],[weights[i] for i in ids],color,smooth)
    if ratio < 1:
        bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Facet_density','DECIMATE'); mod.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def armt(i, side):
    a,b=J[side+'Arm'],J[side+'ForeArm']; d=b-a
    return (verts[i]-a).dot(d)/d.length_squared

def trousers(i):
    return ankle+.035 < verts[i].z < hip+.065 and names[i] in ('Hips','Spine','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg')

def exposed(i):
    n=names[i]; z=verts[i].z
    if n=='Head': return True
    if n in ('Neck','Spine2','Spine1','Spine'): return z>=neck-.16
    if n.startswith(('LeftHand','RightHand','LeftForeArm','RightForeArm')): return True
    if n in ('LeftArm','RightArm'): return armt(i,n[:-3]) > .28
    return ankle+.008 < z < ankle+.045 and n in ('LeftLeg','RightLeg')

skin=piece('Reference_Skin',exposed,0xad714b,smooth=True,ratio=.62)
# A licensed connected garment avoids disconnected shoulder patches and gives a real crew neck.
cm=bpy.data.meshes.new_from_object(tee_source.evaluated_get(deps),depsgraph=deps)
cgroups={g.index:g.name for g in tee_source.vertex_groups}
cv=[v.co*scale+v.normal*.007 for v in cm.vertices]
cw=[{cgroups[g.group]:g.weight for g in v.groups if cgroups[g.group].startswith('mixamorig:') and g.weight>1e-5} for v in cm.vertices]
tee=object_from('Reference_Tee',cv,[list(p.vertices) for p in cm.polygons],cw,0xe7dfca)
bpy.context.view_layer.objects.active=tee
mod=tee.modifiers.new('Fabric_facets','DECIMATE'); mod.ratio=.75
bpy.ops.object.modifier_apply(modifier=mod.name)
bm=bmesh.new(); bm.from_mesh(tee.data)
for v in bm.verts:
    if any(e.is_boundary for e in v.link_edges) and abs(v.co.x)<.15 and v.co.z>neck-.15:
        v.co.x*=.68; v.co.y=-.014+(v.co.y+.014)*.68
        v.co.z=neck-.025-(.009 if v.co.y<-.014 else 0)
bm.to_mesh(tee.data); bm.free(); tee.data.update()
bpy.data.objects.remove(tee_source,do_unlink=True)
pants=piece('Reference_Trousers',trousers,0x356565,offset=.018,ratio=.6)

# Clean the garment's boundary loops: straight hem/cuffs and planar sleeve openings.
def clean_edges(o):
    bm=bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:
        if not any(e.is_boundary for e in v.link_edges): continue
        if v.co.z<ankle+.13: v.co.z=ankle+.046
        elif v.co.z>hip: v.co.z=hip+.065
    bm.to_mesh(o.data); bm.free(); o.data.update()
clean_edges(pants)

def sphere(name, at, dimensions, color, bone='Head', segments=16, rings=8, smooth=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=at)
    tmp=bpy.context.object
    vs=[tmp.matrix_world @ Vector((v.co.x*dimensions[0],v.co.y*dimensions[1],v.co.z*dimensions[2])) for v in tmp.data.vertices]
    fs=[list(p.vertices) for p in tmp.data.polygons]
    bpy.data.objects.remove(tmp,do_unlink=True)
    return object_from(name,vs,fs,[{'mixamorig:'+bone:1.} for v in vs],color,smooth)

def joint_center(group):
    # Joint helper is the anatomical eye centre, fitted by the same targets as the face.
    vg=human.vertex_groups.get(group)
    idx=[v.index for v in human.data.vertices if any(g.group==vg.index for g in v.groups)]
    # Access the unmasked source's evaluated shape keys through the mesh before its helper mask.
    old=human.modifiers.get('Hide helpers'); old.show_viewport=False; bpy.context.view_layer.update()
    full=human.evaluated_get(deps).to_mesh()
    at=sum((full.vertices[i].co for i in idx),Vector())/len(idx)*scale
    human.evaluated_get(deps).to_mesh_clear(); old.show_viewport=True
    return at

E=[]
for side in ('l','r'):
    e=joint_center('joint-'+side+'-eye'); E.append(e)
    sphere('Reference_Eye_'+side,e,(.011,.0105,.010),0xe2d6bc,smooth=True)
    sphere('Reference_Iris_'+side,e+Vector((0,-.0094,0)),(.0062,.0015,.0062),0x5b351d,smooth=True)
    sphere('Reference_Pupil_'+side,e+Vector((0,-.01065,0)),(.0030,.00055,.003),0x16130e,smooth=True)
    sphere('Reference_Catchlight_'+side,e+Vector((-.0016,-.0111,.002)),(.00085,.00025,.00085),0xf5e8d3,smooth=True)

def surface_y(x,z):
    hit=tree.ray_cast(Vector((x,-.6,z)),Vector((0,1,0)),1.)
    return hit[0].y if hit[0] else -.075

for side,e in zip(('l','r'),E):
    sg=1 if e.x > 0 else -1
    points=[]
    for k in range(7):
        u=k/6; x=e.x+sg*(u-.5)*.045; z=e.z+.022+.005*math.sin(math.pi*u)
        points.append(Vector((x,surface_y(x,z)-.002,z)))
    vs=[]
    for p in points: vs.extend([p+Vector((0,0,-.0026)),p+Vector((0,0,.0026))])
    object_from('Reference_Brow_'+side,vs,[[i*2,i*2+1,i*2+3,i*2+2] for i in range(6)],
                [{'mixamorig:Head':1.} for v in vs],0x282018)

# Reference hair: close sides and separate chunky faceted curls, not a sphere cap.
eyez=sum(e.z for e in E)/2
hair=piece('Reference_HairBase',lambda i: names[i]=='Head' and verts[i].z > eyez+.026+(.026 if verts[i].y < J['Head'].y-.035 else 0),
           0x302720,offset=.005,ratio=.35)
headverts=[v for i,v in enumerate(verts) if names[i]=='Head' and v.z>eyez+.03]
hc=Vector((0,(min(v.y for v in headverts)+max(v.y for v in headverts))/2,headtop-.047))
for k in range(72):
    u=(k+.5)/72; phi=k*2.399963; z=.35+.65*u; rr=math.sqrt(1-z*z)
    direction=Vector((rr*math.cos(phi),rr*math.sin(phi),z))
    at=hc+Vector((direction.x*.082,direction.y*.091,direction.z*.073))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
    tmp=bpy.context.object; size=random.uniform(.012,.017)
    vs=[at+Vector((v.co.x*size,v.co.y*size,v.co.z*size*.9)) for v in tmp.data.vertices]
    fs=[list(p.vertices) for p in tmp.data.polygons]; bpy.data.objects.remove(tmp,do_unlink=True)
    object_from('Reference_Curl_'+str(k),vs,fs,[{'mixamorig:Head':1.} for v in vs],random.choice([0x25201b,0x2c251e,0x332a23]))

# Trimmed goatee follows the actual chin/jaw surface; lips remain visible.
M=joint_center('joint-mouth'); mouth=eyez-.064
piece('Reference_Goatee',lambda i: names[i] in ('Head','Neck') and mouth-.045 < verts[i].z < mouth-.018
      and abs(verts[i].x)<.035 and verts[i].y < hc.y-.035,0x30251e,offset=.001,ratio=.55)

for side in ('Left','Right'):
    fc=[v for i,v in enumerate(verts) if names[i] in (side+'Foot',side+'ToeBase')]
    cx=sum(v.x for v in fc)/len(fc); y0=min(v.y for v in fc)-.009; y1=max(v.y for v in fc)+.005
    bone='mixamorig:'+side+'Foot'
    # Structured sneaker upper: rounded toe, lace bed, heel; no individual toes through the shoe.
    ys=[y0,y0+.025,y0+.08,y1-.06,y1-.025,y1]
    widths=[.026,.048,.050,.045,.034,.024]; tops=[.048,.058,.075,.099,.094,.065]
    vs=[]
    for y,w,z in zip(ys,widths,tops):
        for k in range(9):
            a=math.pi*k/8; vs.append(Vector((cx+w*math.cos(a),y,.032+(z-.032)*math.sin(a))))
    fs=[]
    for row in range(len(ys)-1):
        for k in range(8): fs.append([row*9+k,row*9+k+1,(row+1)*9+k+1,(row+1)*9+k])
    fs += [list(range(8,-1,-1)),list(range(45,54))]
    object_from('Reference_Sneaker_'+side,vs,fs,[{bone:1.} for v in vs],0xe9dfca)
    # Thick rounded cream sole.
    outline=[]
    for k in range(20):
        a=math.tau*k/20; outline.append(Vector((cx+.051*math.cos(a),(y0+y1)/2+(y1-y0)/2*math.sin(a),0)))
    sv=[Vector((v.x,v.y,z)) for z in (.012,.033) for v in outline]
    sf=[[k,(k+1)%20,(k+1)%20+20,k+20] for k in range(20)]
    sf += [list(range(19,-1,-1)),list(range(20,40))]
    object_from('Reference_Sole_'+side,sv,sf,[{bone:1.} for v in sv],0xf3ead7)
    for k in range(4):
        sphere('Reference_Lace_'+side+str(k),(cx,y1-.07-k*.012,.091-k*.005),(.033,.0018,.0018),0xf4ebd8,side+'Foot',segments=8,rings=4)
    # Rolled trouser cuff, a small offset shell above each ankle.
    piece('Reference_Cuff_'+side,lambda i: names[i]==side+'Leg' and ankle+.035 < verts[i].z < ankle+.077,
          0x477575,offset=.022,ratio=.8)

# Join to a single vertex-colour skin: one player draw call, no hidden wardrobe or morph collection.
bpy.ops.object.select_all(action='DESELECT')
for o in objects: o.select_set(True)
bpy.context.view_layer.objects.active=skin; bpy.ops.object.join()
hero=bpy.context.object; hero.name='Reference_Character'
for mod in list(hero.modifiers):
    if mod.type!='ARMATURE': hero.modifiers.remove(mod)
# One material across all generated surfaces.
for p in hero.data.polygons: p.material_index=0
while len(hero.data.materials)>1: hero.data.materials.pop(index=len(hero.data.materials)-1)
bpy.data.objects.remove(human,do_unlink=True)
rig.data.pose_position='POSE'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets-src/reference-character/reference_character.blend'))
report={'height':headtop,'vertices':len(hero.data.vertices),'polygons':len(hero.data.polygons),'mouth':list(M),
        'triangles':sum(len(p.vertices)-2 for p in hero.data.polygons),'bones':len(rig.data.bones),
        'eyes':[list(e) for e in E],'joints':{k:list(v) for k,v in J.items()},'targets':targets}
open(os.path.join(ROOT,'assets-src/reference-character/model.json'),'w').write(json.dumps(report,indent=2))
print('REFERENCE_MODEL',json.dumps({k:v for k,v in report.items() if k not in ('joints','targets')}))
