"""Extract only provenance-reviewed anatomy; compact away excluded source data.

Usage: python3 scripts/prepare-study.py /path/to/character_v6.glb
Original asset is opened read-only. Output is a neutral review asset, not final art.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct
import math
from smooth_mesh import smooth_body

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = '43fd6955e610bcf1d5a1258c2ca610d24c2c253d27bf1d759c61ef505cfcbcb2'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == EXPECTED, 'Source differs from reviewed snapshot'
    n = struct.unpack_from('<I', raw, 12)[0]
    src = json.loads(raw[20:20 + n])
    off = 20 + n
    length, chunk_type = struct.unpack_from('<II', raw, off)
    assert chunk_type == 0x004E4942
    binary = raw[off + 8:off + 8 + length]
    payload = bytearray()
    accessors, views, accessor_map, view_map = [], [], {}, {}

    def accessor(index):
        if index in accessor_map:
            return accessor_map[index]
        a = copy.deepcopy(src['accessors'][index])
        assert 'sparse' not in a, 'Unexpected sparse accessor'
        vi = a['bufferView']
        if vi not in view_map:
            v = copy.deepcopy(src['bufferViews'][vi])
            start = v.get('byteOffset', 0)
            while len(payload) % 4:
                payload.append(0)
            v['byteOffset'] = len(payload)
            v['buffer'] = 0
            payload.extend(binary[start:start + v['byteLength']])
            view_map[vi] = len(views)
            views.append(v)
        a['bufferView'] = view_map[vi]
        accessor_map[index] = len(accessors)
        accessors.append(a)
        return len(accessors) - 1

    def floats(index):
        a = src['accessors'][index]
        assert a['componentType'] == 5126 and a['type'] == 'VEC3'
        v = src['bufferViews'][a['bufferView']]
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = v.get('byteStride', 12)
        return [struct.unpack_from('<3f', binary, start + i * stride) for i in range(a['count'])]

    def add_vec3(values):
        while len(payload) % 4:
            payload.append(0)
        start = len(payload)
        for value in values:
            payload.extend(struct.pack('<3f', *value))
        views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(payload) - start, 'target': 34962})
        accessors.append({'bufferView': len(views) - 1, 'componentType': 5126,
                          'count': len(values), 'type': 'VEC3',
                          'min': [min(v[k] for v in values) for k in range(3)],
                          'max': [max(v[k] for v in values) for k in range(3)]})
        return len(accessors) - 1

    # Smooth band envelopes; no uniform upscaling can produce these profiles.
    def band(y, centre, width):
        return math.exp(-((y - centre) / width) ** 2)

    selected = {'Body', 'Eyes', 'Brows', 'Lashes'}
    mesh_ids = [i for i, m in enumerate(src['meshes']) if m.get('name') in selected]
    mesh_map = {old: i for i, old in enumerate(mesh_ids)}
    node_ids = [i for i, node in enumerate(src['nodes']) if 'mesh' not in node or node.get('mesh') in mesh_map]
    node_map = {old: i for i, old in enumerate(node_ids)}
    meshes = []
    for mi in mesh_ids:
        m = src['meshes'][mi]
        primitive = m['primitives'][0]
        attrs = {k: accessor(v) for k, v in primitive['attributes'].items()}
        positions = floats(primitive['attributes']['POSITION'])
        names = m.get('extras', {}).get('targetNames', [])
        deltas = {name: floats(primitive['targets'][names.index(name)]['POSITION'])
                  for name in ['Heavy', 'Muscular'] if name in names}
        profiles = []
        for heavy in [False, True]:
            result = []
            for i, (x, y, z) in enumerate(positions):
                muscle = deltas.get('Muscular', [(0, 0, 0)] * len(positions))[i]
                weight = deltas.get('Heavy', [(0, 0, 0)] * len(positions))[i]
                mx = 2.2 if heavy else 1.65
                wt = 1.2 if heavy else 0.1
                nx, ny, nz = (positions[i][k] + mx * muscle[k] + wt * weight[k] for k in range(3))
                # Face/eyes remain compatible; trunk and legs carry the difference.
                chest = band(y, 1.34, 0.30)
                waist = band(y, 1.08, 0.18)
                thigh = band(y, 0.68, 0.35)
                neck = band(y, 1.53, 0.10)
                nx *= 1 + (0.20 if heavy else 0.07) * chest + (0.13 if heavy else -0.025) * waist + (0.12 if heavy else 0.02) * thigh + (0.10 if heavy else 0.025) * neck
                nz *= 1 + (0.30 if heavy else 0.08) * chest + (0.20 if heavy else 0.0) * waist + (0.16 if heavy else 0.035) * thigh
                result.append((nx - x, ny - y, nz - z))
            profiles.append({'POSITION': add_vec3(result)})
        meshes.append({'name': m['name'], 'primitives': [{'attributes': attrs,
                       'indices': accessor(primitive['indices']), 'material': 0, 'targets': profiles}],
                       'weights': [0, 0], 'extras': {'targetNames': ['AthleticStudy', 'HeavyStudy']}})
    nodes = []
    for i in node_ids:
        original = src['nodes'][i]
        node = {k: copy.deepcopy(v) for k, v in original.items() if k not in ['extras', 'extensions', 'children', 'mesh']}
        if 'mesh' in original:
            node['mesh'] = mesh_map[original['mesh']]
        if 'children' in original:
            node['children'] = [node_map[c] for c in original['children'] if c in node_map]
        nodes.append(node)
    skins = []
    for original in src['skins']:
        skin = {'joints': [node_map[i] for i in original['joints']],
                'inverseBindMatrices': accessor(original['inverseBindMatrices'])}
        if 'skeleton' in original:
            skin['skeleton'] = node_map[original['skeleton']]
        skins.append(skin)
    doc = {'asset': {'version': '2.0', 'generator': 'Roi des Arenes neutral study extractor'},
           'scene': 0, 'scenes': [{'nodes': [node_map[i] for i in src['scenes'][src.get('scene', 0)]['nodes'] if i in node_map]}],
           'nodes': nodes, 'meshes': meshes, 'skins': skins, 'accessors': accessors, 'bufferViews': views,
           'materials': [{'name': 'NeutralStudy', 'pbrMetallicRoughness': {'baseColorFactor': [0.24, 0.10, 0.055, 1], 'metallicFactor': 0, 'roughnessFactor': 0.58}}],
           'buffers': [{'byteLength': len(payload)}]}
    smoothing = smooth_body(doc, payload)
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    payload.extend(b'\x00' * (-len(payload) % 4))
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(payload))
    glb += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    glb += struct.pack('<II', len(payload), 0x004E4942) + payload
    out = ROOT / 'public/assets/anatomy-study.glb'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(glb)
    evidence = {'source_sha256': EXPECTED, 'output_sha256': hashlib.sha256(glb).hexdigest(),
                'output_bytes': len(glb), 'meshes': [m['name'] for m in meshes],
                'joint_count': len(skins[0]['joints']), 'animation_count': 0,
                'texture_count': 0, 'profiles': ['AthleticStudy', 'HeavyStudy'],
                'source_unchanged': hashlib.sha256(args.source.read_bytes()).hexdigest() == EXPECTED, **smoothing}
    (ROOT / 'public/assets/anatomy-study.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    main()
