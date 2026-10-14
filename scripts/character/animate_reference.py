"""Retarget selected CC0 Quaternius UAL clips to the reference's clean finger rig.
Blender --background --python scripts/character/animate_reference.py -- REPO UAL.glb
"""
import bpy, sys, os, json, math
from mathutils import Vector, Matrix, Quaternion
ROOT, UAL = sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'assets-src/reference-character/reference_character.blend'))
tgt=bpy.data.objects['Reference_Rig']; hero=bpy.data.objects['Reference_Character']
tgt.animation_data_clear()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=UAL)
imported=[o for o in bpy.data.objects if o not in before]
src=next(o for o in imported if o.type=='ARMATURE')
source_actions={a.name:a for a in bpy.data.actions}
scene=bpy.context.scene; source_fps=scene.render.fps; scene.render.fps=60
# A relaxed standing human capture replaces the library's tense game-ready idle.
cmu_file=os.path.join(ROOT,'assets-src/reference-character/cmu-idle.bvh')
oldobjects=set(bpy.data.objects)
bpy.ops.import_anim.bvh(filepath=cmu_file,axis_forward='-Z',axis_up='Y',use_fps_scale=False,update_scene_fps=False,update_scene_duration=False)
cmu=next(o for o in bpy.data.objects if o not in oldobjects); imported.append(cmu)
cmu_action=cmu.animation_data.action
oldobjects=set(bpy.data.objects)
bpy.ops.import_anim.bvh(filepath=os.path.join(ROOT,'assets-src/reference-character/cmu-turn.bvh'),axis_forward='-Z',axis_up='Y',use_fps_scale=False,update_scene_fps=False,update_scene_duration=False)
turn_src=next(o for o in bpy.data.objects if o not in oldobjects); imported.append(turn_src)
turn_action=turn_src.animation_data.action
mapping={'Hips':'pelvis','Spine':'spine_01','Spine1':'spine_02','Spine2':'spine_03','Neck':'neck_01','Head':'Head'}
for side,suffix in [('Left','l'),('Right','r')]:
    for a,b in [('Shoulder','clavicle'),('Arm','upperarm'),('ForeArm','lowerarm'),('Hand','hand'),('UpLeg','thigh'),('Leg','calf'),('Foot','foot'),('ToeBase','ball')]:
        mapping[side+a]=b+'_'+suffix
    for finger in ['Index','Middle','Pinky','Ring','Thumb']:
        for k in range(1,4): mapping[side+'Hand'+finger+str(k)]=finger.lower()+'_'+str(k).zfill(2)+'_'+suffix

def basis(rig,left,right,spine,hips):
    mw=rig.matrix_world
    l=mw@rig.data.bones[left].head_local; r=mw@rig.data.bones[right].head_local
    up=(mw@rig.data.bones[spine].head_local-mw@rig.data.bones[hips].head_local).normalized()
    right=(r-l).normalized(); forward=up.cross(right).normalized(); right=forward.cross(up).normalized()
    if min(up.length,right.length,forward.length)<.99: raise ValueError('Degenerate rest basis: '+rig.name+' / '+spine)
    return Matrix((right,forward,up)).transposed().to_quaternion()
def heading_fix(source,alignment,left,right,spine,hips):
    mw=source.matrix_world; pb=source.pose.bones
    up=(mw@pb[spine].head-mw@pb[hips].head).normalized()
    right=(mw@pb[right].head-mw@pb[left].head).normalized()
    if min(up.length,right.length)<.99: raise ValueError('Degenerate pose basis: '+source.name+' / '+spine)
    forward=alignment@up.cross(right).normalized(); wanted=tf@Vector((0,1,0))
    return Quaternion(Vector((0,0,1)),math.atan2(wanted.y,wanted.x)-math.atan2(forward.y,forward.x))
sf=basis(src,'thigh_l','thigh_r','spine_01','pelvis')
tf=basis(tgt,'mixamorig:LeftUpLeg','mixamorig:RightUpLeg','mixamorig:Spine','mixamorig:Hips')
align=tf@sf.inverted()
src_scale=tgt.data.bones['mixamorig:Head'].head_local.z/src.data.bones['Head'].head_local.z
parents=[b for b in tgt.data.bones] # armature bone order is parent first
sole_points={}
for side in ('Left','Right'):
    bn='mixamorig:'+side+'Foot'; vg=hero.vertex_groups[bn]
    sole_points[bn]=[v.co.copy() for v in hero.data.vertices if v.co.z<.014 and any(g.group==vg.index and g.weight>.99 for g in v.groups)]
def corrections(source,map_,alignment):
    result={}
    for b in parents:
        sn=map_.get(b.name.split(':')[-1]); sb=source.data.bones.get(sn) if sn else None
        if not sb: continue
        sq=(source.matrix_world@sb.matrix_local).to_quaternion(); tq=(tgt.matrix_world@b.matrix_local).to_quaternion()
        source_dir=alignment@(sq@Vector((0,1,0)))
        calibrated=(tq@Vector((0,1,0))).rotation_difference(source_dir)@tq
        result[b.name]=(alignment@sq).inverted()@calibrated
    return result
correction=corrections(src,mapping,align)
cmu_mapping={b.name.split(':')[-1]:b.name.split(':')[-1] for b in parents}
cmu_mapping.update(Spine='LowerBack',Spine1='Spine',Spine2='Spine1')
cmu_align=tf@basis(cmu,'LeftUpLeg','RightUpLeg','Spine','Hips').inverted()
cmu_correction=corrections(cmu,cmu_mapping,cmu_align)
turn_align=tf@basis(turn_src,'LeftUpLeg','RightUpLeg','Spine','Hips').inverted()
turn_correction=corrections(turn_src,cmu_mapping,turn_align)

clips={'Idle':'Idle_Loop','Walk':'Walk_Loop','Jog':'Jog_Fwd_Loop','Run':'Sprint_Loop',
       'Sit':'Sitting_Idle_Loop','SitEnter':'Sitting_Enter','SitExit':'Sitting_Exit',
       'Talk':'Idle_Talking_Loop','Celebrate':'Dance_Loop','Kneel':'Fixing_Kneeling','Ride':'Driving_Loop',
       'TurnLeft':'Walk_Loop'}
report={}; baked=[]
for name,source_name in clips.items():
    idle=name=='Idle'; turning=name=='TurnLeft'; captured=idle or turning
    source=cmu if idle else turn_src if turning else src
    map_=cmu_mapping if captured else mapping; corr=cmu_correction if idle else turn_correction if turning else correction
    aln=cmu_align if idle else turn_align if turning else align
    sa=cmu_action if idle else turn_action if turning else source_actions[source_name]; source.animation_data.action=sa
    try: source.animation_data.action_slot=source.animation_data.action_suitable_slots[0]
    except Exception: pass
    start,end=(1,361) if idle else (1,145) if turning else sa.frame_range
    duration=(end-start)/120 if captured else (end-start)/source_fps
    frames=max(2,round(duration*60))
    ta=bpy.data.actions.new('Reference_'+name); tgt.animation_data_create(); tgt.animation_data.action=ta
    for pb in tgt.pose.bones: pb.rotation_mode='QUATERNION'; pb.location=(0,0,0); pb.rotation_quaternion=(1,0,0,0)
    hipbase=None; hipheights=[]; initial_world={}; contacts=[]
    for f in range(frames+1):
        at=float(start)+f/frames*(end-start)
        scene.frame_set(math.floor(at),subframe=at%1)
        yawfix=heading_fix(source,aln,'LeftUpLeg','RightUpLeg','Spine','Hips') if captured else Quaternion()
        desired={}
        for b in parents:
            pb=tgt.pose.bones[b.name]; sn=map_.get(b.name.split(':')[-1]); sp=source.pose.bones.get(sn) if sn else None
            if sp and b.name in corr:
                world=yawfix@aln@(source.matrix_world@sp.matrix).to_quaternion()@corr[b.name]
            else: world=(tgt.matrix_world@b.matrix_local).to_quaternion()
            if f==0: initial_world[b.name]=world.copy()
            captured_delta=world@initial_world[b.name].inverted()
            short=b.name.split(':')[-1]
            # Retarget the capture onto an authored relaxed standing pose. Keep its subtle weight transfer,
            # rather than the source actor's looking-up/talking performance or game-ready combat stance.
            neutral=idle or (turning and short not in ('Hips','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot','LeftToeBase','RightToeBase'))
            if neutral:
                rest=b.matrix_local.to_quaternion(); restdir=rest@Vector((0,1,0))
                if short in ('LeftArm','RightArm','LeftForeArm','RightForeArm'):
                    sign=1 if short.startswith('Left') else -1
                    want=Vector((sign*.055,-.025,-1)).normalized()
                    world=restdir.rotation_difference(want)@rest
                elif short in ('LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'):
                    world=restdir.rotation_difference(Vector((0,0,-1)))@rest
                elif short in ('LeftHand','RightHand'):
                    local=b.parent.matrix_local.inverted()@b.matrix_local
                    world=desired[b.parent.name]@local.to_quaternion()
                else: world=rest
                if idle and short in ('Hips','Spine','Spine1','Spine2','Neck','Head','LeftArm','RightArm','LeftForeArm','RightForeArm'):
                    world=Quaternion().slerp(captured_delta,.2*math.sin(math.pi*f/frames)**2)@world
            desired[b.name]=world
            restlocal=(b.parent.matrix_local.inverted()@b.matrix_local if b.parent else b.matrix_local).to_quaternion()
            parentq=desired[b.parent.name] if b.parent else tgt.matrix_world.to_quaternion()
            q=restlocal.inverted()@parentq.inverted()@world
            if name not in ('Jog','Run') and 'Hand' in b.name and any(s in b.name for s in ('Index','Middle','Ring','Pinky','Thumb')):
                # Open, lightly curled fingers instead of the stock clenched fighting hand.
                restq=b.matrix_local.to_quaternion(); direction=restq@Vector((0,1,0))
                axis=restq.inverted()@direction.cross(Vector((0,-1,0))).normalized()
                amount=.08 if 'Thumb' in b.name else .22 if b.name.endswith('2') else .15
                q=Quaternion(axis,amount)
                world=parentq@restlocal@q; desired[b.name]=world
            # Blender keys must use a continuous quaternion hemisphere.
            if pb.rotation_quaternion.dot(q)<0: q.negate()
            pb.rotation_quaternion=q
            pb.keyframe_insert(data_path='rotation_quaternion',frame=f+1,group=b.name)
        if name in ('Walk','Jog','Run'):
            # Retarget the mannequin's stride to adult human legs. Preserve its knee pole,
            # heel orientation and phase; solve the two leg bones to the scaled ankle path.
            heads={}
            for b in parents:
                if b.parent:
                    heads[b.name]=heads[b.parent.name]+desired[b.parent.name]@(b.parent.matrix_local.to_quaternion().inverted()@(b.head_local-b.parent.head_local))
                else: heads[b.name]=b.head_local.copy()
            stride={'Walk':1.35,'Jog':.48,'Run':.65}[name]
            for side in ('Left','Right'):
                hn,kn,fn=['mixamorig:'+side+s for s in ('UpLeg','Leg','Foot')]
                h,k,a=[heads[n] for n in (hn,kn,fn)]
                goal=a.copy(); goal.y=h.y+(a.y-h.y)*stride
                direction=(goal-h).normalized()
                l1=(tgt.data.bones[kn].head_local-tgt.data.bones[hn].head_local).length
                l2=(tgt.data.bones[fn].head_local-tgt.data.bones[kn].head_local).length
                distance=min((goal-h).length,(l1+l2)*.985)
                goal=h+direction*distance
                old_direction=(a-h).normalized()
                pole=k-h-old_direction*(k-h).dot(old_direction)
                pole-=direction*pole.dot(direction)
                if pole.length<1e-6: pole=Vector((0,-1,0))-direction*Vector((0,-1,0)).dot(direction)
                pole.normalize()
                along=(l1*l1-l2*l2+distance*distance)/(2*distance)
                newk=h+direction*along+pole*math.sqrt(max(0,l1*l1-along*along))
                for bn,want in ((hn,(newk-h).normalized()),(kn,(goal-newk).normalized())):
                    old=desired[bn]; desired[bn]=(old@Vector((0,1,0))).rotation_difference(want)@old
                for bn in (hn,kn,fn):
                    b=tgt.data.bones[bn]; pb=tgt.pose.bones[bn]
                    restlocal=(b.parent.matrix_local.inverted()@b.matrix_local).to_quaternion()
                    q=restlocal.inverted()@desired[b.parent.name].inverted()@desired[bn]
                    if pb.rotation_quaternion.dot(q)<0: q.negate()
                    pb.rotation_quaternion=q
                    pb.keyframe_insert(data_path='rotation_quaternion',frame=f+1,group=bn)
        if name in ('Sit','SitEnter','SitExit'):
            # The library's mannequin holds its hands in front of its abdomen. Fit the captured
            # arm pose to this body's lap instead, preserving its elbow pole and torso motion.
            p=1 if name=='Sit' else f/frames if name=='SitEnter' else 1-f/frames
            blend=max(0,min(1,(p-.35)/.65)); blend=blend*blend*(3-2*blend)
            heads={}
            for b in parents:
                if b.parent:
                    heads[b.name]=heads[b.parent.name]+desired[b.parent.name]@(b.parent.matrix_local.to_quaternion().inverted()@(b.head_local-b.parent.head_local))
                else: heads[b.name]=b.head_local.copy()
            for side,sign in (('Left',1),('Right',-1)):
                sn,en,wn=['mixamorig:'+side+s for s in ('Arm','ForeArm','Hand')]
                hn,kn=['mixamorig:'+side+s for s in ('UpLeg','Leg')]
                shoulder,elbow,wrist=[heads[n] for n in (sn,en,wn)]
                thigh=heads[kn]-heads[hn]
                # Wrist sits above the trousers; palm thickness and the curled finger pads
                # account for the remaining clearance (checked against the exported skin).
                lap=heads[hn]+thigh*.45+Vector((0,0,.155))
                goal=wrist.lerp(lap,blend)
                # Lift the hand briefly as it reaches/releases the lap, avoiding the curled
                # fingertips sweeping through fabric during the captured stand/sit transition.
                goal.z += .06*math.sin(math.pi*blend)
                direction=(goal-shoulder).normalized()
                l1=(tgt.data.bones[en].head_local-tgt.data.bones[sn].head_local).length
                l2=(tgt.data.bones[wn].head_local-tgt.data.bones[en].head_local).length
                distance=min((goal-shoulder).length,(l1+l2)*.985)
                old_direction=(wrist-shoulder).normalized()
                pole=elbow-shoulder-old_direction*(elbow-shoulder).dot(old_direction)
                pole-=direction*pole.dot(direction)
                if pole.length<1e-6: pole=Vector((sign,0,0))-direction*direction.x*sign
                pole.normalize()
                along=(l1*l1-l2*l2+distance*distance)/(2*distance)
                bent=shoulder+direction*along+pole*math.sqrt(max(0,l1*l1-along*along))
                goal=shoulder+direction*distance
                for bn,want in ((sn,(bent-shoulder).normalized()),(en,(goal-bent).normalized())):
                    old=desired[bn]; desired[bn]=(old@Vector((0,1,0))).rotation_difference(want)@old
                # Fingers point along the thigh, thumb toward the body, palm down. Calibrate
                # from the actual finger spread so this doesn't depend on imported bone rolls.
                hand=tgt.data.bones[wn]
                index=tgt.data.bones[wn+'Index1']; pinky=tgt.data.bones[wn+'Pinky1']; middle=tgt.data.bones[wn+'Middle1']
                longitudinal=(middle.head_local-hand.head_local).normalized()
                across=index.head_local-pinky.head_local; across=(across-longitudinal*across.dot(longitudinal)).normalized()
                restbasis=Matrix((across,longitudinal,across.cross(longitudinal))).transposed()
                forward=Vector((thigh.x,thigh.y,0)).normalized()
                inward=Vector((-sign,0,0)); inward=(inward-forward*inward.dot(forward)).normalized()
                lapbasis=Matrix((inward,forward,inward.cross(forward))).transposed()
                flat=(lapbasis@restbasis.inverted()).to_quaternion()@hand.matrix_local.to_quaternion()
                desired[wn]=desired[wn].slerp(flat,blend)
                for bn in (sn,en,wn):
                    b=tgt.data.bones[bn]; pb=tgt.pose.bones[bn]
                    restlocal=(b.parent.matrix_local.inverted()@b.matrix_local).to_quaternion()
                    q=restlocal.inverted()@desired[b.parent.name].inverted()@desired[bn]
                    if pb.rotation_quaternion.dot(q)<0: q.negate()
                    pb.rotation_quaternion=q
                    pb.keyframe_insert(data_path='rotation_quaternion',frame=f+1,group=bn)
        # Preserve measured vertical weight transfer, removing horizontal/root travel (game owns translation).
        source_hip=source.matrix_world@source.pose.bones['Hips' if captured else 'pelvis'].head
        if hipbase is None: hipbase=source_hip.z
        hip=tgt.pose.bones['mixamorig:Hips']; dz=(source_hip.z-src.data.bones['pelvis'].head_local.z)*src_scale
        if name in ('Idle','Walk','Jog','Run','TurnLeft','Talk','Celebrate'): dz=(source_hip.z-hipbase)*(src_scale if not captured else .0254)
        # The seat contract is butt contact at .48 m, not a pelvis-bone position at .48 m.
        # This anatomy's seat surface is ~14 cm below the pelvis in the retargeted pose.
        if name=='Sit': dz=.62-tgt.data.bones['mixamorig:Hips'].head_local.z
        if name in ('SitEnter','SitExit'):
            p=f/frames if name=='SitEnter' else 1-f/frames
            dz += .07*(1-p)-.014*p
        if name in ('Idle','Walk','Jog','Run','TurnLeft','Talk'):
            # FK of the actual shoe soles, not guessed ankle heights. Stance reaches local ground;
            # jog/sprint use these samples to adapt root height and preserve a short aerial phase.
            heads={}
            for b in parents:
                if b.parent:
                    offset=b.head_local-b.parent.head_local
                    heads[b.name]=heads[b.parent.name]+desired[b.parent.name]@(b.parent.matrix_local.to_quaternion().inverted()@offset)
                else: heads[b.name]=b.head_local.copy()
            bottoms=[]; soles={}
            for bn,points in sole_points.items():
                b=tgt.data.bones[bn]; delta=desired[bn]@b.matrix_local.to_quaternion().inverted()
                positions=[heads[bn]+delta@(v-b.head_local) for v in points]
                bottoms += [p.z for p in positions]
                soles[bn]=[sum(p.y for p in positions)/len(positions),min(p.z for p in positions)]
            if name not in ('Jog','Run'): dz=.035-min(bottoms)
            contacts.append({'dz':dz,'bottom':min(bottoms),'soles':soles})
        hip.location=hip.bone.matrix_local.to_3x3().inverted()@Vector((0,0,dz))
        hip.keyframe_insert(data_path='location',frame=f+1,group=hip.name)
        hipheights.append(dz)
    if name in ('Jog','Run'):
        floor=min(c['bottom']+c['dz'] for c in contacts)
        hip=tgt.pose.bones['mixamorig:Hips']
        for f,dz in enumerate(hipheights):
            c=contacts[f]
            # Adapt root height to this anatomy and keep a short aerial phase, rather than
            # reproducing the source mannequin's 30 cm clearance with much longer legs.
            flight=min(.065 if name=='Jog' else .09,max(0,(c['bottom']+dz-floor-.06)*.35))
            # Five millimetres allow for skin/quaternion interpolation between baked contact keys.
            hipheights[f]=.040-c['bottom']+flight
            hip.location=hip.bone.matrix_local.to_3x3().inverted()@Vector((0,0,hipheights[f]))
            hip.keyframe_insert(data_path='location',frame=f+1,group=hip.name)
    ta.name=name; ta.use_fake_user=True; baked.append(ta)
    report[name]={'source':'CMU 18_08 frames 130–490 (relaxed-pose adaptation, closed loop)' if idle else 'CMU 13_26 frames 977–1121 (quarter turn)' if turning else source_name,'duration':duration,'frames':frames+1,'hipRange':[min(hipheights),max(hipheights)]}
    if name in ('Walk','Jog','Run'):
        from statistics import median
        floor=min(c['bottom']+d for c,d in zip(contacts,hipheights)); velocities=[]
        for a,b,da,db in zip(contacts,contacts[1:],hipheights,hipheights[1:]):
            for bn in sole_points:
                if max(a['soles'][bn][1]+da,b['soles'][bn][1]+db)<floor+.025:
                    velocities.append(abs(b['soles'][bn][0]-a['soles'][bn][0])/(duration/frames))
        report[name]['stanceSpeed']=median(velocities) if velocities else None

# Mirror the calibrated capture's deformation onto the opposite limb, respecting each bone's
# own rest roll. S R S preserves a proper rotation; simply negating local quaternion components
# would be wrong for this rig's differing left/right rest axes.
left=next(a for a in baked if a.name=='TurnLeft')
samples=[]; tgt.animation_data.action=left
for f in range(round(report['TurnLeft']['duration']*60)+1):
    scene.frame_set(f+1)
    samples.append({b.name:(tgt.pose.bones[b.name].matrix.to_quaternion().copy(),tgt.pose.bones[b.name].location.copy()) for b in parents})
right=bpy.data.actions.new('TurnRight'); right.use_fake_user=True; tgt.animation_data.action=right
mirror=Matrix.Diagonal((-1,1,1))
for f,sample in enumerate(samples):
    desired={}
    for b in parents:
        other=b.name.replace('Left','Right') if 'Left' in b.name else b.name.replace('Right','Left')
        sourceq,location=sample[other]; sourcebone=tgt.data.bones[other]
        delta=sourceq@sourcebone.matrix_local.to_quaternion().inverted()
        world=(mirror@delta.to_matrix()@mirror).to_quaternion()@b.matrix_local.to_quaternion()
        desired[b.name]=world
        restlocal=(b.parent.matrix_local.inverted()@b.matrix_local if b.parent else b.matrix_local).to_quaternion()
        parentq=desired[b.parent.name] if b.parent else tgt.matrix_world.to_quaternion()
        q=restlocal.inverted()@parentq.inverted()@world
        pb=tgt.pose.bones[b.name]
        if pb.rotation_quaternion.dot(q)<0: q.negate()
        pb.rotation_quaternion=q
        pb.keyframe_insert(data_path='rotation_quaternion',frame=f+1,group=b.name)
        if not b.parent:
            pb.location=b.matrix_local.to_3x3().inverted()@mirror@sourcebone.matrix_local.to_3x3()@location
            pb.keyframe_insert(data_path='location',frame=f+1,group=b.name)
baked.append(right); report['TurnRight']={**report['TurnLeft'],'source':report['TurnLeft']['source']+'; mirrored deformation / swapped limbs'}

# NLA export only these selected, retargeted clips. Original source rig/geometry never ships.
tgt.animation_data.action=None
for act in baked:
    track=tgt.animation_data.nla_tracks.new(); track.name=act.name
    strip=track.strips.new(act.name,1,act); strip.name=act.name
for o in imported: bpy.data.objects.remove(o,do_unlink=True)
for a in list(bpy.data.actions):
    if a not in baked: bpy.data.actions.remove(a)
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT'); tgt.select_set(True); hero.select_set(True); bpy.context.view_layer.objects.active=tgt
for track in tgt.animation_data.nla_tracks: track.mute=True
# Rest export binding is the authored mesh, NLA tracks are evaluated only during each clip's export.
tgt.data.pose_position='POSE'
out=os.path.join(ROOT,'public/assets/reference_character.glb')
for track in tgt.animation_data.nla_tracks: track.mute=False
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_yup=True,
  export_skins=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,
  export_optimize_animation_size=True,export_materials='EXPORT',export_vertex_color='ACTIVE',
  export_active_vertex_color_when_no_material=True,export_morph=False,export_lights=False,export_cameras=False)
tgt.data.pose_position='POSE'
for track in tgt.animation_data.nla_tracks: track.mute=True
tgt.animation_data.action=next(a for a in baked if a.name=='Idle'); scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets-src/reference-character/reference_character.blend'))
open(os.path.join(ROOT,'assets-src/reference-character/animations.json'),'w').write(json.dumps(report,indent=2))
open(os.path.join(ROOT,'src/actors/referenceMotion.json'),'w').write(json.dumps({name:report[name]['stanceSpeed'] for name in ('Walk','Jog','Run')},indent=2)+'\n')
print('REFERENCE_ANIMATIONS',json.dumps({'bytes':os.path.getsize(out),'clips':report}))
