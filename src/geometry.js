// ============================================================
// Mesh Decoder
// ============================================================
function decodeMesh(b64str) {
    const bin = Uint8Array.from(atob(b64str), c => c.charCodeAt(0));
    const dv = new DataView(bin.buffer);
    let off = 0;
    const nVerts = dv.getUint32(off, true); off += 4;
    const vertices = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts * 3; i++) {
        vertices[i] = dv.getFloat32(off, true); off += 4;
    }
    const nTris = dv.getUint32(off, true); off += 4;
    const indices = new Uint32Array(nTris * 3);
    for (let i = 0; i < nTris * 3; i++) {
        indices[i] = dv.getUint32(off, true); off += 4;
    }
    return { vertices, indices, nVerts, nTris };
}

// ============================================================
// Box Generator (12 triangles for a rectangular solid)
// ============================================================
function generateBox(xMin, xMax, yMin, yMax, zMin, zMax) {
    const v = [
        [xMin,yMin,zMin],[xMax,yMin,zMin],[xMax,yMax,zMin],[xMin,yMax,zMin],
        [xMin,yMin,zMax],[xMax,yMin,zMax],[xMax,yMax,zMax],[xMin,yMax,zMax]
    ];
    const faces = [
        [0,2,1],[0,3,2], // bottom (Z-)
        [4,5,6],[4,6,7], // top (Z+)
        [0,1,5],[0,5,4], // front (Y-)
        [2,3,7],[2,7,6], // back (Y+)
        [0,4,7],[0,7,3], // left (X-)
        [1,2,6],[1,6,5], // right (X+)
    ];
    const tris = [];
    for (const [a,b,c] of faces) {
        tris.push([v[a], v[b], v[c]]);
    }
    return tris;
}

// ============================================================
// Mesh to Triangles
// ============================================================
function meshToTriangles(mesh) {
    const triangles = [];
    for (let t = 0; t < mesh.nTris; t++) {
        const i0 = mesh.indices[t * 3] * 3;
        const i1 = mesh.indices[t * 3 + 1] * 3;
        const i2 = mesh.indices[t * 3 + 2] * 3;
        triangles.push([
            [mesh.vertices[i0], mesh.vertices[i0+1], mesh.vertices[i0+2]],
            [mesh.vertices[i1], mesh.vertices[i1+1], mesh.vertices[i1+2]],
            [mesh.vertices[i2], mesh.vertices[i2+1], mesh.vertices[i2+2]],
        ]);
    }
    return triangles;
}

// ============================================================
// Triangle Clipping
// ============================================================
// Clip triangles against a plane. axis: 0=X, 1=Y. keepSide: +1 or -1.
function clipTriangles(triangles, axis, position, keepSide) {
    const result = [];
    for (const tri of triangles) {
        const d = [
            (tri[0][axis] - position) * keepSide,
            (tri[1][axis] - position) * keepSide,
            (tri[2][axis] - position) * keepSide,
        ];
        const inside = [d[0] >= 0, d[1] >= 0, d[2] >= 0];
        const numInside = inside[0] + inside[1] + inside[2];

        if (numInside === 3) {
            result.push(tri);
        } else if (numInside === 0) {
            continue;
        } else {
            const verts = [];
            for (let i = 0; i < 3; i++) {
                const j = (i + 1) % 3;
                if (inside[i]) verts.push(tri[i]);
                if (inside[i] !== inside[j]) {
                    const t = d[i] / (d[i] - d[j]);
                    verts.push([
                        tri[i][0] + t * (tri[j][0] - tri[i][0]),
                        tri[i][1] + t * (tri[j][1] - tri[i][1]),
                        tri[i][2] + t * (tri[j][2] - tri[i][2]),
                    ]);
                }
            }
            if (verts.length >= 3) result.push([verts[0], verts[1], verts[2]]);
            if (verts.length >= 4) result.push([verts[0], verts[2], verts[3]]);
        }
    }
    return result;
}

// ============================================================
// Cell Mesh Cache
// ============================================================
const CLIP_LEFT = 1, CLIP_RIGHT = 2, CLIP_TOP = 4, CLIP_BOTTOM = 8;
const cellMeshCache = {};
let gridMeshCache = null;

function getGridMesh() {
    if (!gridMeshCache) gridMeshCache = decodeMesh(MESH_GRID_1X1);
    return gridMeshCache;
}

function getClippedCellMesh(clipFlags) {
    if (cellMeshCache[clipFlags]) return cellMeshCache[clipFlags];
    const mesh = getGridMesh();
    let tris = meshToTriangles(mesh);

    const half = GRID_PITCH / 2;
    if (clipFlags & CLIP_LEFT)   tris = clipTriangles(tris, 0, -half, +1);
    if (clipFlags & CLIP_RIGHT)  tris = clipTriangles(tris, 0,  half, -1);
    if (clipFlags & CLIP_TOP)    tris = clipTriangles(tris, 1, -half, +1);
    if (clipFlags & CLIP_BOTTOM) tris = clipTriangles(tris, 1,  half, -1);

    // Restore border-zone corners removed by perpendicular perimeter clips.
    // The connector tabs on the panel border sit at cell boundaries (±half),
    // so a perimeter clip at ±half on the perpendicular axis cuts them in half.
    // Fix: extract each affected corner piece (border zone × removed zone)
    // from the unclipped mesh and add it back.
    if (clipFlags) {
        const full = meshToTriangles(mesh);

        if (clipFlags & CLIP_TOP) {
            if (!(clipFlags & CLIP_RIGHT)) {
                let c = clipTriangles(full, 0, half, +1);   // right border zone
                tris = tris.concat(clipTriangles(c, 1, -half, -1)); // removed by top clip
            }
            if (!(clipFlags & CLIP_LEFT)) {
                let c = clipTriangles(full, 0, -half, -1);  // left border zone
                tris = tris.concat(clipTriangles(c, 1, -half, -1));
            }
        }
        if (clipFlags & CLIP_BOTTOM) {
            if (!(clipFlags & CLIP_RIGHT)) {
                let c = clipTriangles(full, 0, half, +1);
                tris = tris.concat(clipTriangles(c, 1, half, +1));
            }
            if (!(clipFlags & CLIP_LEFT)) {
                let c = clipTriangles(full, 0, -half, -1);
                tris = tris.concat(clipTriangles(c, 1, half, +1));
            }
        }
        if (clipFlags & CLIP_LEFT) {
            if (!(clipFlags & CLIP_TOP)) {
                let c = clipTriangles(full, 1, -half, -1);  // top border zone
                tris = tris.concat(clipTriangles(c, 0, -half, -1)); // removed by left clip
            }
            if (!(clipFlags & CLIP_BOTTOM)) {
                let c = clipTriangles(full, 1, half, +1);   // bottom border zone
                tris = tris.concat(clipTriangles(c, 0, -half, -1));
            }
        }
        if (clipFlags & CLIP_RIGHT) {
            if (!(clipFlags & CLIP_TOP)) {
                let c = clipTriangles(full, 1, -half, -1);
                tris = tris.concat(clipTriangles(c, 0, half, +1));
            }
            if (!(clipFlags & CLIP_BOTTOM)) {
                let c = clipTriangles(full, 1, half, +1);
                tris = tris.concat(clipTriangles(c, 0, half, +1));
            }
        }
    }

    cellMeshCache[clipFlags] = tris;
    return tris;
}

function clearCellMeshCache() {
    for (const k in cellMeshCache) delete cellMeshCache[k];
}
