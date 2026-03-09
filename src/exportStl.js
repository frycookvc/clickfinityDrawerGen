// ============================================================
// Binary STL Writer
// ============================================================
function writeBinarySTL(triangles) {
    const nTris = triangles.length;
    const bufSize = 84 + nTris * 50;
    const buf = new ArrayBuffer(bufSize);
    const dv = new DataView(buf);

    // Header (80 bytes)
    const header = "ClickFinity Baseplate Generator";
    for (let i = 0; i < 80; i++) {
        dv.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
    }
    dv.setUint32(80, nTris, true);

    let off = 84;
    for (const [v0, v1, v2] of triangles) {
        const ux = v1[0]-v0[0], uy = v1[1]-v0[1], uz = v1[2]-v0[2];
        const wx = v2[0]-v0[0], wy = v2[1]-v0[1], wz = v2[2]-v0[2];
        let nx = uy*wz - uz*wy;
        let ny = uz*wx - ux*wz;
        let nz = ux*wy - uy*wx;
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if (len > 1e-10) { nx /= len; ny /= len; nz /= len; }

        dv.setFloat32(off, nx, true); off += 4;
        dv.setFloat32(off, ny, true); off += 4;
        dv.setFloat32(off, nz, true); off += 4;
        for (const v of [v0, v1, v2]) {
            dv.setFloat32(off, v[0], true); off += 4;
            dv.setFloat32(off, v[1], true); off += 4;
            dv.setFloat32(off, v[2], true); off += 4;
        }
        dv.setUint16(off, 0, true); off += 2;
    }
    return buf;
}
