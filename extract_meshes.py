#!/usr/bin/env python3
"""Extract meshes from ClickFinity 3MF and encode as base64 for embedding in HTML."""

import zipfile
import xml.etree.ElementTree as ET
import struct
import base64

THREEMF = "Clickfinity+Baseplates.3mf"
NS = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}

OBJECTS = {
    "grid_1x1": "3D/Objects/object_7.model",
    "joiner": "3D/Objects/object_26.model",
    "hub": "3D/Objects/object_25.model",
}


def extract_mesh(zf, path):
    data = zf.read(path).decode()
    root = ET.fromstring(data)
    mesh = root.find(".//m:mesh", NS)
    verts_el = mesh.find("m:vertices", NS)
    tris_el = mesh.find("m:triangles", NS)

    verts = []
    for v in verts_el:
        verts.append((float(v.get("x")), float(v.get("y")), float(v.get("z"))))

    tris = []
    for t in tris_el:
        tris.append((int(t.get("v1")), int(t.get("v2")), int(t.get("v3"))))

    return verts, tris


def pack_mesh(verts, tris):
    """Pack as binary: [uint32 nVerts][float32 x,y,z * nVerts][uint32 nTris][uint32 v1,v2,v3 * nTris]"""
    parts = []
    parts.append(struct.pack("<I", len(verts)))
    for x, y, z in verts:
        parts.append(struct.pack("<fff", x, y, z))
    parts.append(struct.pack("<I", len(tris)))
    for v1, v2, v3 in tris:
        parts.append(struct.pack("<III", v1, v2, v3))
    return b"".join(parts)


def bounding_box(verts):
    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def main():
    zf = zipfile.ZipFile(THREEMF)
    results = {}

    for name, path in OBJECTS.items():
        verts, tris = extract_mesh(zf, path)
        bb = bounding_box(verts)
        print(f"{name}: {len(verts)} verts, {len(tris)} tris")
        print(f"  Bounding box: X[{bb[0]:.2f}, {bb[1]:.2f}] Y[{bb[2]:.2f}, {bb[3]:.2f}] Z[{bb[4]:.2f}, {bb[5]:.2f}]")
        print(f"  Size: {bb[1]-bb[0]:.2f} x {bb[3]-bb[2]:.2f} x {bb[5]-bb[4]:.2f} mm")

        binary = pack_mesh(verts, tris)
        b64 = base64.b64encode(binary).decode("ascii")
        results[name] = b64
        print(f"  Binary: {len(binary)} bytes, Base64: {len(b64)} chars")
        print()

    # Write JS constants file
    with open("mesh_data.js", "w") as f:
        f.write("// Auto-generated mesh data from ClickFinity 3MF\n")
        f.write("// Do not edit manually\n\n")
        for name, b64 in results.items():
            f.write(f"const MESH_{name.upper()} = '{b64}';\n\n")

    print("Written to mesh_data.js")
    print(f"Total size: {sum(len(v) for v in results.values())} chars base64")


if __name__ == "__main__":
    main()
