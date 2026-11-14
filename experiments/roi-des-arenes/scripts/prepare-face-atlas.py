"""Recover reviewed source atlas UVs as a separate, seam-safe runtime sidecar.

Geometry/rig files are read-only. Replay the existing Loop topology ordering;
face-varying UVs use linear subdivision and duplicate seam corners only.
"""
from pathlib import Path
import json, struct, hashlib, math
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('/Users/habibdiallo/DakarRek-assets/character_v6.glb')
STUDY=ROOT/'public/assets/anatomy-study.glb'

def load(path):
    raw=path.read_bytes(); n=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+n]); offset=20+n; length=struct.unpack_from('<I',raw,offset)[0]
    binary=raw[offset+8:offset+8+length]
    def read(i):
        a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']]
        count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        fmt='<'+{5123:'H',5125:'I',5126:'f'}[a['componentType']]*count
        stride=v.get('byteStride',struct.calcsize(fmt));start=v.get('byteOffset',0)+a.get('byteOffset',0)
        return [struct.unpack_from(fmt,binary,start+j*stride) for j in range(a['count'])]
    p=next(m for m in doc['meshes'] if m['name']=='Body')['primitives'][0]
    return raw,p,read
raw,p,read=load(SOURCE);assert hashlib.sha256(raw).hexdigest()=='43fd6955e610bcf1d5a1258c2ca610d24c2c253d27bf1d759c61ef505cfcbcb2'
sraw,sp,sread=load(STUDY);study_hash=hashlib.sha256(sraw).hexdigest();assert study_hash=='990f1806a19e940e66b67a1482dcda8509a90e206cae948bbf89f6b4274d9257'
positions=read(p['attributes']['POSITION']);uv=read(p['attributes']['TEXCOORD_0']);original_indices=[v[0] for v in read(p['indices'])]
vertices=[];remap={};unique={}
for i,co in enumerate(positions):
    key=tuple(round(v,5) for v in co)
    if key not in unique:unique[key]=len(vertices);vertices.append(co)
    remap[i]=unique[key]
faces=[];uvfaces=[]
for i in range(0,len(original_indices),3):
    ids=original_indices[i:i+3];face=tuple(remap[j] for j in ids)
    if len(set(face))==3:faces.append(face);uvfaces.append([uv[j] for j in ids])
edges={};neighbors=[set() for _ in vertices];boundary=[set() for _ in vertices]
for a,b,c in faces:
    for x,y,o in [(a,b,c),(b,c,a),(c,a,b)]:edges.setdefault(tuple(sorted((x,y))),[]).append(o);neighbors[x].add(y);neighbors[y].add(x)
for (a,b),opposites in edges.items():
    if len(opposites)==1:boundary[a].add(b);boundary[b].add(a)
# Verify the exact retained basis positions as well as topology before producing UVs.
smoothed=[]
for i,co in enumerate(vertices):
    adjacent=list(neighbors[i])
    if len(boundary[i])==2:terms=[(i,.75)]+[(j,.125) for j in boundary[i]]
    elif adjacent:
        beta=3/16 if len(adjacent)==3 else 3/(8*len(adjacent));terms=[(i,1-beta*len(adjacent))]+[(j,beta) for j in adjacent]
    else:terms=[(i,1)]
    smoothed.append(tuple(sum(vertices[j][k]*w for j,w in terms) for k in range(3)))
edge_index={}
for (a,b),opposites in edges.items():
    edge_index[(a,b)]=len(smoothed)
    terms=[(a,.5),(b,.5)] if len(opposites)!=2 else [(a,.375),(b,.375)]+[(j,.125) for j in opposites]
    smoothed.append(tuple(sum(vertices[j][k]*w for j,w in terms) for k in range(3)))
retained=sread(sp['attributes']['POSITION']);assert len(retained)==len(smoothed)
error=max(abs(a-b) for p1,p2 in zip(retained,smoothed) for a,b in zip(p1,p2));assert error<1e-7,error
newfaces=[];corner_uv=[]
mid=lambda a,b:tuple((x+y)/2 for x,y in zip(a,b))
for (a,b,c),(au,bu,cu) in zip(faces,uvfaces):
    ab=edge_index[tuple(sorted((a,b)))];bc=edge_index[tuple(sorted((b,c)))];ca=edge_index[tuple(sorted((c,a)))]
    abu,bcu,cau=mid(au,bu),mid(bu,cu),mid(cu,au)
    newfaces.extend([(a,ab,ca),(b,bc,ab),(c,ca,bc),(ab,bc,ca)])
    corner_uv.extend([(au,abu,cau),(bu,bcu,abu),(cu,cau,bcu),(abu,bcu,cau)])
assert [i for f in newfaces for i in f]==[v[0] for v in sread(sp['indices'])]
source_vertices=list(range(len(retained)));coords=[None]*len(retained);new_indices=[];variants={}
for face,uvs in zip(newfaces,corner_uv):
    for vertex,coord in zip(face,uvs):
        key=(vertex,tuple(round(v,8) for v in coord))
        if key not in variants:
            if coords[vertex] is None:index=vertex;coords[index]=coord
            else:index=len(coords);coords.append(coord);source_vertices.append(vertex)
            variants[key]=index
        new_indices.append(variants[key])
coords=[c or (0,0) for c in coords]
assert all(0<=x<=1 for co in coords for x in co)
out={'study_sha256':study_hash,'original_vertices':len(retained),'source_vertices':source_vertices,'uv':[x for co in coords for x in co],'indices':new_indices}
(ROOT/'public/assets/face-atlas.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
evidence={'source_sha256':hashlib.sha256(raw).hexdigest(),'study_sha256':study_hash,'basis_max_error':error,'original_vertices':len(retained),'runtime_vertices':len(coords),'triangles':len(newfaces),'seam_copies':len(coords)-len(retained),'uv_subdivision':'linear, per source face corner; original Loop geometry unchanged','source_unchanged':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==hashlib.sha256(raw).hexdigest(),'study_unchanged':hashlib.sha256(STUDY.read_bytes()).hexdigest()==study_hash}
(ROOT/'evidence/WEB-004-uv-reconstruction.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps(evidence,indent=2))
