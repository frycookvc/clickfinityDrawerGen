// ============================================================
// Panel Mesh Generator
// ============================================================
function generatePanelTriangles(panel) {
    const { nx, ny, edgeFills, hasLeftBorder, hasRightBorder, hasTopBorder, hasBottomBorder } = panel;
    const triangles = [];

    // Determine which outer edges need clipping (edges with fills replace the border)
    const clipL = !hasLeftBorder;   // outer left edge
    const clipR = !hasRightBorder;  // outer right edge
    const clipT = !hasTopBorder;    // outer top edge
    const clipB = !hasBottomBorder; // outer bottom edge

    // Tile cells
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            let flags = 0;
            if (i === 0 && clipL)      flags |= CLIP_LEFT;
            if (i === nx - 1 && clipR) flags |= CLIP_RIGHT;
            if (j === 0 && clipT)      flags |= CLIP_TOP;
            if (j === ny - 1 && clipB) flags |= CLIP_BOTTOM;

            const cellTris = getClippedCellMesh(flags);

            const leftEdge = (hasLeftBorder ? PANEL_BORDER_HALF : 0);
            const topEdge = (hasTopBorder ? PANEL_BORDER_HALF : 0);
            const totalW = edgeFills.left + leftEdge + nx * GRID_PITCH + (hasRightBorder ? PANEL_BORDER_HALF : 0) + edgeFills.right;
            const totalH = edgeFills.top + topEdge + ny * GRID_PITCH + (hasBottomBorder ? PANEL_BORDER_HALF : 0) + edgeFills.bottom;
            const ox = -totalW / 2 + edgeFills.left + leftEdge + (i + 0.5) * GRID_PITCH;
            const oy = -totalH / 2 + edgeFills.top + topEdge + (j + 0.5) * GRID_PITCH;

            for (const tri of cellTris) {
                triangles.push([
                    [tri[0][0] + ox, tri[0][1] + oy, tri[0][2]],
                    [tri[1][0] + ox, tri[1][1] + oy, tri[1][2]],
                    [tri[2][0] + ox, tri[2][1] + oy, tri[2][2]],
                ]);
            }
        }
    }

    // Edge fill flat boxes
    const leftEdge = hasLeftBorder ? PANEL_BORDER_HALF : 0;
    const rightEdge = hasRightBorder ? PANEL_BORDER_HALF : 0;
    const topEdge = hasTopBorder ? PANEL_BORDER_HALF : 0;
    const bottomEdge = hasBottomBorder ? PANEL_BORDER_HALF : 0;
    const totalW = edgeFills.left + leftEdge + nx * GRID_PITCH + rightEdge + edgeFills.right;
    const totalH = edgeFills.top + topEdge + ny * GRID_PITCH + bottomEdge + edgeFills.bottom;
    const halfW = totalW / 2;
    const halfH = totalH / 2;

    const fillZoneTop = -halfH + edgeFills.top;
    const fillZoneBottom = halfH - edgeFills.bottom;

    // Joiner cutout dimensions: boundary joiners intrude into border zones at fill corners
    const cutIntrusion = JOINER_TAB_INTRUSION; // 2.4mm from border edge
    const cutShort = JOINER_HALF_LEN + 0.3;   // 3.59mm from fill inner edge (+ clearance for nub offset)

    // Left fill: cutouts at top/bottom corners where horizontal strip boundary joiners enter
    if (edgeFills.left > 0.01) {
        const x0 = -halfW, x1 = -halfW + edgeFills.left;
        const needTopCut = hasTopBorder;
        const needBottomCut = hasBottomBorder;
        if (!needTopCut && !needBottomCut) {
            triangles.push(...generateBox(x0, x1, fillZoneTop, fillZoneBottom, PANEL_Z_MIN, PANEL_Z_MAX));
        } else {
            const cutX = Math.min(cutShort, edgeFills.left);
            const yT = needTopCut ? fillZoneTop + cutIntrusion : fillZoneTop;
            const yB = needBottomCut ? fillZoneBottom - cutIntrusion : fillZoneBottom;
            if (yB - yT > 0.01)
                triangles.push(...generateBox(x0, x1, yT, yB, PANEL_Z_MIN, PANEL_Z_MAX));
            if (needTopCut && x1 - cutX - x0 > 0.01)
                triangles.push(...generateBox(x0, x1 - cutX, fillZoneTop, fillZoneTop + cutIntrusion, PANEL_Z_MIN, PANEL_Z_MAX));
            if (needBottomCut && x1 - cutX - x0 > 0.01)
                triangles.push(...generateBox(x0, x1 - cutX, fillZoneBottom - cutIntrusion, fillZoneBottom, PANEL_Z_MIN, PANEL_Z_MAX));
        }
    }

    // Right fill: cutouts at top/bottom corners
    if (edgeFills.right > 0.01) {
        const x0 = halfW - edgeFills.right, x1 = halfW;
        const needTopCut = hasTopBorder;
        const needBottomCut = hasBottomBorder;
        if (!needTopCut && !needBottomCut) {
            triangles.push(...generateBox(x0, x1, fillZoneTop, fillZoneBottom, PANEL_Z_MIN, PANEL_Z_MAX));
        } else {
            const cutX = Math.min(cutShort, edgeFills.right);
            const yT = needTopCut ? fillZoneTop + cutIntrusion : fillZoneTop;
            const yB = needBottomCut ? fillZoneBottom - cutIntrusion : fillZoneBottom;
            if (yB - yT > 0.01)
                triangles.push(...generateBox(x0, x1, yT, yB, PANEL_Z_MIN, PANEL_Z_MAX));
            if (needTopCut && x1 - (x0 + cutX) > 0.01)
                triangles.push(...generateBox(x0 + cutX, x1, fillZoneTop, fillZoneTop + cutIntrusion, PANEL_Z_MIN, PANEL_Z_MAX));
            if (needBottomCut && x1 - (x0 + cutX) > 0.01)
                triangles.push(...generateBox(x0 + cutX, x1, fillZoneBottom - cutIntrusion, fillZoneBottom, PANEL_Z_MIN, PANEL_Z_MAX));
        }
    }

    // Top fill: cutouts at left/right corners where vertical strip boundary joiners enter
    if (edgeFills.top > 0.01) {
        const y0 = -halfH, y1 = -halfH + edgeFills.top;
        const needLeftCut = hasLeftBorder;
        const needRightCut = hasRightBorder;
        if (!needLeftCut && !needRightCut) {
            triangles.push(...generateBox(-halfW, halfW, y0, y1, PANEL_Z_MIN, PANEL_Z_MAX));
        } else {
            const cutY = Math.min(cutShort, edgeFills.top);
            const xL = needLeftCut ? -halfW + cutIntrusion : -halfW;
            const xR = needRightCut ? halfW - cutIntrusion : halfW;
            if (y1 - cutY - y0 > 0.01)
                triangles.push(...generateBox(-halfW, halfW, y0, y1 - cutY, PANEL_Z_MIN, PANEL_Z_MAX));
            if (xR - xL > 0.01)
                triangles.push(...generateBox(xL, xR, y1 - cutY, y1, PANEL_Z_MIN, PANEL_Z_MAX));
        }
    }

    // Bottom fill: cutouts at left/right corners
    if (edgeFills.bottom > 0.01) {
        const y0 = halfH - edgeFills.bottom, y1 = halfH;
        const needLeftCut = hasLeftBorder;
        const needRightCut = hasRightBorder;
        if (!needLeftCut && !needRightCut) {
            triangles.push(...generateBox(-halfW, halfW, y0, y1, PANEL_Z_MIN, PANEL_Z_MAX));
        } else {
            const cutY = Math.min(cutShort, edgeFills.bottom);
            const xL = needLeftCut ? -halfW + cutIntrusion : -halfW;
            const xR = needRightCut ? halfW - cutIntrusion : halfW;
            if (xR - xL > 0.01)
                triangles.push(...generateBox(xL, xR, y0, y0 + cutY, PANEL_Z_MIN, PANEL_Z_MAX));
            if (y1 - (y0 + cutY) > 0.01)
                triangles.push(...generateBox(-halfW, halfW, y0 + cutY, y1, PANEL_Z_MIN, PANEL_Z_MAX));
        }
    }

    return triangles;
}
