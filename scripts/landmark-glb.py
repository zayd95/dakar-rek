#!/usr/bin/env python3
"""Makes a generated landmark model light enough for the game (src/world/landmarks.ts).

usage: python3 scripts/landmark-glb.py <in.glb> <out.glb> [--size 1024] [--bronze] [--quality 86]

A model from Meshy is one mesh with one material and up to three 2048 PNG maps (colour, normal, metal/roughness): 13 to 28 MB. The game lights a landmark as a matt
surface, so only the colour map is kept, reduced to --size and stored as JPEG; the mesh is kept as it is. --bronze re-tones the colour map from the generator's dark
olive to bronze, keeping its light and shade (the Monument de la Renaissance's group).
Needs Pillow. Writes nothing but <out.glb>.
"""
import io, json, struct, sys
from PIL import Image, ImageOps


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__); sys.exit(2)
    src, dst = args[0], args[1]
    size = int(args[args.index('--size') + 1]) if '--size' in args else 1024
    quality = int(args[args.index('--quality') + 1]) if '--quality' in args else 86
    b = open(src, 'rb').read()
    clen = struct.unpack('<I', b[12:16])[0]
    js = json.loads(b[20:20 + clen]); bo = 20 + clen + 8
    bv = js['bufferViews']

    def view(i):
        v = bv[i]; o = bo + v.get('byteOffset', 0)
        return b[o:o + v['byteLength']]

    if len(js['meshes']) != 1 or len(js['meshes'][0]['primitives']) != 1:
        print(f"{src}: {len(js['meshes'])} meshes, {[len(m['primitives']) for m in js['meshes']]} primitives: one mesh of one primitive is expected"); sys.exit(1)
    prim = js['meshes'][0]['primitives'][0]
    keep = {k: prim['attributes'][k] for k in ('POSITION', 'NORMAL', 'TEXCOORD_0') if k in prim['attributes']}
    order = list(keep.values()) + [prim['indices']]
    mat = js['materials'][prim['material']]
    tex = mat.get('pbrMetallicRoughness', {}).get('baseColorTexture')
    parts, views, accessors = [], [], []
    binb = b''
    for n, ai in enumerate(order):
        a = dict(js['accessors'][ai]); d = view(a['bufferView'])
        binb += b'\0' * ((-len(binb)) % 4)
        views.append({'buffer': 0, 'byteOffset': len(binb), 'byteLength': len(d), 'target': 34963 if n == len(order) - 1 else 34962})
        a['bufferView'] = n; a.pop('byteOffset', None); accessors.append(a); binb += d
    material = {'name': 'landmark', 'doubleSided': False, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.85}}
    out = {'asset': {'version': '2.0', 'generator': 'Meshy; reduced for the game by scripts/landmark-glb.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'landmark'}],
           'meshes': [{'primitives': [{'attributes': {k: i for i, k in enumerate(keep)}, 'indices': len(order) - 1, 'material': 0}]}], 'accessors': accessors, 'materials': [material]}
    if tex is not None:
        img = Image.open(io.BytesIO(view(js['images'][js['textures'][tex['index']]['source']]['bufferView']))).convert('RGB').resize((size, size), Image.LANCZOS)
        if '--bronze' in args:
            g = ImageOps.autocontrast(ImageOps.grayscale(img), cutoff=1)
            img = Image.blend(ImageOps.colorize(g, black=(34, 21, 12), white=(226, 176, 120), mid=(132, 92, 58)), img, 0.18)
        buf = io.BytesIO(); img.save(buf, 'JPEG', quality=quality); jpg = buf.getvalue()
        binb += b'\0' * ((-len(binb)) % 4)
        views.append({'buffer': 0, 'byteOffset': len(binb), 'byteLength': len(jpg)}); binb += jpg
        out['images'] = [{'bufferView': len(views) - 1, 'mimeType': 'image/jpeg'}]
        out['samplers'] = [{'magFilter': 9729, 'minFilter': 9987}]
        out['textures'] = [{'sampler': 0, 'source': 0}]
        material['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
    binb += b'\0' * ((-len(binb)) % 4)
    out['bufferViews'] = views; out['buffers'] = [{'byteLength': len(binb)}]
    j = json.dumps(out, separators=(',', ':')).encode(); j += b' ' * ((-len(j)) % 4)
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(j) + 8 + len(binb)) + struct.pack('<I', len(j)) + b'JSON' + j + struct.pack('<I', len(binb)) + b'BIN\0' + binb
    open(dst, 'wb').write(glb)
    idx = js['accessors'][prim['indices']]['count']
    pos = js['accessors'][prim['attributes']['POSITION']]
    print(f"{dst}: {len(glb) / 1e6:.2f} MB, {idx // 3} triangles, {pos['count']} vertices, box {pos.get('min')} … {pos.get('max')}, texture {'%d px' % size if tex is not None else 'none'}")


main()
