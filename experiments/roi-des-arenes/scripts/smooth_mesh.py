"""One deterministic Loop subdivision pass on the isolated body study.

Interpolates skin weights and both morph targets; retains the rig and normal
morphs. UV seam duplicates are welded because this study has no image textures.
No third-party modelling or subdivision package is used.
"""
import math
import struct


def smooth_body(doc, binary):
    mesh = next(m for m in doc['meshes'] if m['name'] == 'Body')
    primitive = mesh['primitives'][0]
    sizes = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    formats = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}

    def read(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        count = sizes[a['type']]
        fmt = '<' + formats[a['componentType']] * count
        stride = view.get('byteStride', struct.calcsize(fmt))
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        values = [struct.unpack_from(fmt, binary, offset + i * stride) for i in range(a['count'])]
        if a.get('normalized'):
            scale = 255 if a['componentType'] == 5121 else 65535
            values = [tuple(x / scale for x in value) for value in values]
        return values

    attrs = primitive['attributes']
    pos = read(attrs['POSITION'])
    colors = read(attrs['COLOR_0'])
    joints = read(attrs['JOINTS_0'])
    weights = read(attrs['WEIGHTS_0'])
    targets = [read(target['POSITION']) for target in primitive['targets']]
    vertices, remap, unique = [], {}, {}
    for i, point in enumerate(pos):
        key = tuple(round(v, 5) for v in point)
        if key not in unique:
            unique[key] = len(vertices)
            vertices.append({'co': list(point), 'color': list(colors[i]),
                             'skin': {int(j): w for j, w in zip(joints[i], weights[i]) if w > 0},
                             'morph': [list(target[i]) for target in targets]})
        remap[i] = unique[key]
    indices = [int(v[0]) for v in read(primitive['indices'])]
    faces = [tuple(remap[v] for v in indices[i:i + 3]) for i in range(0, len(indices), 3)]
    faces = [f for f in faces if len(set(f)) == 3]
    edges, neighbors = {}, [set() for _ in vertices]
    for a, b, c in faces:
        for x, y, opposite in [(a, b, c), (b, c, a), (c, a, b)]:
            edges.setdefault(tuple(sorted((x, y))), []).append(opposite)
            neighbors[x].add(y)
            neighbors[y].add(x)
    boundary = [set() for _ in vertices]
    for (a, b), opposite in edges.items():
        if len(opposite) == 1:
            boundary[a].add(b)
            boundary[b].add(a)

    def blend(terms):
        result = {'co': [0.] * 3, 'color': [0.] * len(colors[0]), 'skin': {}, 'morph': [[0.] * 3 for _ in targets]}
        for index, weight in terms:
            source = vertices[index]
            for key in ['co', 'color']:
                for k in range(len(result[key])):
                    result[key][k] += source[key][k] * weight
            for joint, value in source['skin'].items():
                result['skin'][joint] = result['skin'].get(joint, 0) + weight * value
            for target in range(len(targets)):
                for k in range(3):
                    result['morph'][target][k] += source['morph'][target][k] * weight
        return result

    output = []
    for i in range(len(vertices)):
        adjacent = list(neighbors[i])
        if len(boundary[i]) == 2:
            output.append(blend([(i, .75)] + [(j, .125) for j in boundary[i]]))
        elif adjacent:
            beta = 3 / 16 if len(adjacent) == 3 else 3 / (8 * len(adjacent))
            output.append(blend([(i, 1 - beta * len(adjacent))] + [(j, beta) for j in adjacent]))
        else:
            output.append(vertices[i])
    edge_index = {}
    for (a, b), opposite in edges.items():
        edge_index[(a, b)] = len(output)
        terms = [(a, .5), (b, .5)] if len(opposite) != 2 else [(a, .375), (b, .375)] + [(v, .125) for v in opposite]
        output.append(blend(terms))
    new_faces = []
    for a, b, c in faces:
        ab = edge_index[tuple(sorted((a, b)))]
        bc = edge_index[tuple(sorted((b, c)))]
        ca = edge_index[tuple(sorted((c, a)))]
        new_faces.extend([(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)])

    def normals(positions):
        result = [[0.] * 3 for _ in positions]
        for a, b, c in new_faces:
            u = [positions[b][k] - positions[a][k] for k in range(3)]
            v = [positions[c][k] - positions[a][k] for k in range(3)]
            n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            for i in [a, b, c]:
                for k in range(3):
                    result[i][k] += n[k]
        for n in result:
            length = math.sqrt(sum(v * v for v in n)) or 1
            for k in range(3):
                n[k] /= length
        return result

    def add(values, component=5126, target=34962):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        count = len(values[0])
        fmt = '<' + formats[component] * count
        for value in values:
            binary.extend(struct.pack(fmt, *value))
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(binary) - offset, 'target': target})
        a = {'bufferView': len(doc['bufferViews']) - 1, 'componentType': component,
             'count': len(values), 'type': {1: 'SCALAR', 3: 'VEC3', 4: 'VEC4'}[count],
             'min': [min(v[k] for v in values) for k in range(count)],
             'max': [max(v[k] for v in values) for k in range(count)]}
        doc['accessors'].append(a)
        return len(doc['accessors']) - 1

    positions = [v['co'] for v in output]
    normal = normals(positions)
    joint_values, weight_values = [], []
    for vertex in output:
        skin = sorted(vertex['skin'].items(), key=lambda kv: -kv[1])[:4]
        skin += [(0, 0)] * (4 - len(skin))
        total = sum(v for _, v in skin)
        joint_values.append([j for j, _ in skin])
        weight_values.append([v / total for _, v in skin])
    primitive['attributes'] = {'POSITION': add(positions), 'NORMAL': add(normal),
                               'COLOR_0': add([v['color'] for v in output]),
                               'JOINTS_0': add(joint_values, 5123), 'WEIGHTS_0': add(weight_values)}
    primitive['indices'] = add([(i,) for f in new_faces for i in f], 5125, 34963)
    primitive['targets'] = []
    for target in range(len(targets)):
        morph = [v['morph'][target] for v in output]
        morphed = [[positions[i][k] + value[k] for k in range(3)] for i, value in enumerate(morph)]
        target_normal = normals(morphed)
        primitive['targets'].append({'POSITION': add(morph),
                                     'NORMAL': add([[target_normal[i][k] - normal[i][k] for k in range(3)] for i in range(len(normal))])})
    doc['buffers'][0]['byteLength'] = len(binary)
    return {'body_vertices': len(output), 'body_triangles': len(new_faces), 'subdivision_passes': 1}
