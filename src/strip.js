// ============================================================
// Joiner Mesh Generator with Nub Offset
// ============================================================
function generateJoinerTriangles(tabOffset) {
    const mesh = decodeMesh(MESH_JOINER);
    const triangles = [];
    // Joiner bb: X[-3.29, 3.29] Y[-16.9, 16.9]
    // Tab zones are at the ends: |Y| > 12mm approximately
    // Nub vertices protrude at |X| > 2.5 (snap bump at |X|=2.846 vs tab wall at |X|~2.15)
    const TAB_Y_THRESHOLD = 12.0;
    const NUB_X_THRESHOLD = 2.5;

    const modVerts = new Float32Array(mesh.vertices.length);
    for (let i = 0; i < mesh.nVerts; i++) {
        let x = mesh.vertices[i * 3];
        const y = mesh.vertices[i * 3 + 1];
        const z = mesh.vertices[i * 3 + 2];
        if (Math.abs(y) > TAB_Y_THRESHOLD && Math.abs(x) > NUB_X_THRESHOLD && Math.abs(tabOffset) > 0.001) {
            if (x > 0) x += tabOffset;
            else if (x < 0) x -= tabOffset;
        }
        modVerts[i * 3] = x;
        modVerts[i * 3 + 1] = y;
        modVerts[i * 3 + 2] = z;
    }

    for (let t = 0; t < mesh.nTris; t++) {
        const i0 = mesh.indices[t * 3] * 3;
        const i1 = mesh.indices[t * 3 + 1] * 3;
        const i2 = mesh.indices[t * 3 + 2] * 3;
        triangles.push([
            [modVerts[i0], modVerts[i0+1], modVerts[i0+2]],
            [modVerts[i1], modVerts[i1+1], modVerts[i1+2]],
            [modVerts[i2], modVerts[i2+1], modVerts[i2+2]],
        ]);
    }
    return triangles;
}

// ============================================================
// Connector / Edge Strip Generator
// ============================================================
function generateConnectorStrip(numCells, tabOffset, orientation, fillStart, fillEnd, skipCells) {
    const joinerBase = generateJoinerTriangles(tabOffset);
    const triangles = [];

    const isVertical = orientation === 'vertical';
    const gapHalf = (GRID_PITCH - PANEL_BORDER_TOTAL) / 2; // 14.5mm
    const stripHalf = numCells / 2 * GRID_PITCH;

    // Fill bars at perimeter end zones only (not full-length, to keep joiner zone open for bins)
    if (fillStart > 0.01) {
        if (isVertical) {
            triangles.push(...generateBox(
                -gapHalf, gapHalf,
                -stripHalf - fillStart, -stripHalf,
                PANEL_Z_MIN, PANEL_Z_MAX));
        } else {
            triangles.push(...generateBox(
                -stripHalf - fillStart, -stripHalf,
                -gapHalf, gapHalf,
                PANEL_Z_MIN, PANEL_Z_MAX));
        }
    }
    if (fillEnd > 0.01) {
        if (isVertical) {
            triangles.push(...generateBox(
                -gapHalf, gapHalf,
                stripHalf, stripHalf + fillEnd,
                PANEL_Z_MIN, PANEL_Z_MAX));
        } else {
            triangles.push(...generateBox(
                stripHalf, stripHalf + fillEnd,
                -gapHalf, gapHalf,
                PANEL_Z_MIN, PANEL_Z_MAX));
        }
    }

    // Place numCells joiners at cell centers (every 42mm), skipping crossing positions
    for (let i = 0; i < numCells; i++) {
        if (skipCells && skipCells.has(i)) continue;
        const pos = (i - (numCells - 1) / 2) * GRID_PITCH;
        for (const tri of joinerBase) {
            if (isVertical) {
                triangles.push([
                    [tri[0][1], tri[0][0] + pos, tri[0][2]],
                    [tri[1][1], tri[1][0] + pos, tri[1][2]],
                    [tri[2][1], tri[2][0] + pos, tri[2][2]],
                ]);
            } else {
                triangles.push([
                    [tri[0][0] + pos, tri[0][1], tri[0][2]],
                    [tri[1][0] + pos, tri[1][1], tri[1][2]],
                    [tri[2][0] + pos, tri[2][1], tri[2][2]],
                ]);
            }
        }
    }

    // Full joiners at perimeter boundaries (preserve nubs for hub connections)
    if (fillStart > 0.01) {
        const boundaryJoiner = joinerBase;
        const pos = -stripHalf;
        for (const tri of boundaryJoiner) {
            if (isVertical) {
                triangles.push([
                    [tri[0][1], tri[0][0] + pos, tri[0][2]],
                    [tri[1][1], tri[1][0] + pos, tri[1][2]],
                    [tri[2][1], tri[2][0] + pos, tri[2][2]],
                ]);
            } else {
                triangles.push([
                    [tri[0][0] + pos, tri[0][1], tri[0][2]],
                    [tri[1][0] + pos, tri[1][1], tri[1][2]],
                    [tri[2][0] + pos, tri[2][1], tri[2][2]],
                ]);
            }
        }
    }

    if (fillEnd > 0.01) {
        const boundaryJoiner = joinerBase;
        const pos = stripHalf;
        for (const tri of boundaryJoiner) {
            if (isVertical) {
                triangles.push([
                    [tri[0][1], tri[0][0] + pos, tri[0][2]],
                    [tri[1][1], tri[1][0] + pos, tri[1][2]],
                    [tri[2][1], tri[2][0] + pos, tri[2][2]],
                ]);
            } else {
                triangles.push([
                    [tri[0][0] + pos, tri[0][1], tri[0][2]],
                    [tri[1][0] + pos, tri[1][1], tri[1][2]],
                    [tri[2][0] + pos, tri[2][1], tri[2][2]],
                ]);
            }
        }
    }

    return triangles;
}
