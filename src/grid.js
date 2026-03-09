// ============================================================
// Grid Calculator
// ============================================================
function calculateGrid(width, depth, alignment) {
    const unitsX = Math.floor((width - PANEL_BORDER_TOTAL) / GRID_PITCH);
    const unitsY = Math.floor((depth - PANEL_BORDER_TOTAL) / GRID_PITCH);
    if (unitsX <= 0 || unitsY <= 0) return null;

    const gridSpanX = PANEL_BORDER_TOTAL + GRID_PITCH * unitsX;
    const gridSpanY = PANEL_BORDER_TOTAL + GRID_PITCH * unitsY;

    const gapX = width - gridSpanX;
    const gapY = depth - gridSpanY;

    let offsetX, offsetY;
    if (alignment === 'top-left') {
        offsetX = 0; offsetY = 0;
    } else if (alignment === 'bottom-right') {
        offsetX = gapX; offsetY = gapY;
    } else {
        offsetX = gapX / 2; offsetY = gapY / 2;
    }

    return { unitsX, unitsY, gridSpanX, gridSpanY, gapX, gapY, offsetX, offsetY };
}

// ============================================================
// Panel Partition
// ============================================================
function partitionWithConnectors(totalUnits, maxUnitsPerPanel) {
    // Each connector column between panels consumes 1 grid unit.
    // With C panels: connector columns = C-1, panel units = totalUnits - (C-1)
    // Minimum C: ceil((totalUnits + 1) / (maxUnitsPerPanel + 1))
    if (totalUnits <= maxUnitsPerPanel) return [totalUnits];
    for (let C = Math.ceil((totalUnits + 1) / (maxUnitsPerPanel + 1)); C <= totalUnits; C++) {
        const panelUnits = totalUnits - (C - 1);
        if (panelUnits <= 0) break;
        if (panelUnits > C * maxUnitsPerPanel) continue;
        const sizes = splitIntoC(panelUnits, C, maxUnitsPerPanel);
        if (sizes) return sizes;
    }
    // Fallback: single-unit panels
    return Array(totalUnits).fill(1);
}

function splitIntoC(total, C, maxPer) {
    const base = Math.floor(total / C);
    const remainder = total % C;
    if (base > maxPer) return null;
    if (base + 1 > maxPer && remainder > 0) return null;
    const result = [];
    for (let i = 0; i < remainder; i++) result.push(base + 1);
    for (let i = remainder; i < C; i++) result.push(base);
    return result.sort((a, b) => b - a);
}

// ============================================================
// Strip Partition
// ============================================================
function partitionStripCells(numCells, fillStart, fillEnd) {
    const totalExtent = fillStart + numCells * GRID_PITCH + fillEnd;
    if (totalExtent <= MAX_PRINT_BED) {
        return [{ cells: numCells, fillStart, fillEnd }];
    }
    const maxPlain = Math.floor(MAX_PRINT_BED / GRID_PITCH);
    const maxFirst = Math.max(1, Math.floor((MAX_PRINT_BED - fillStart) / GRID_PITCH));
    const maxLast  = Math.max(1, Math.floor((MAX_PRINT_BED - fillEnd) / GRID_PITCH));

    let nSegs = 2;
    while (true) {
        const capacity = maxFirst + maxLast + Math.max(0, nSegs - 2) * maxPlain;
        if (capacity >= numCells) break;
        nSegs++;
    }

    const segments = [];
    let remaining = numCells;
    for (let s = 0; s < nSegs; s++) {
        const maxForSeg = s === 0 ? maxFirst : (s === nSegs - 1 ? maxLast : maxPlain);
        const segsLeft = nSegs - s;
        const cells = Math.min(maxForSeg, Math.ceil(remaining / segsLeft));
        segments.push({
            cells,
            fillStart: s === 0 ? fillStart : 0,
            fillEnd: s === nSegs - 1 ? fillEnd : 0,
        });
        remaining -= cells;
    }
    return segments;
}

// ============================================================
// Layout Computation
// ============================================================
function computeLayout(grid) {
    const { unitsX, unitsY, gapX, gapY, offsetX, offsetY } = grid;
    const fillLeft = offsetX + PANEL_BORDER_HALF;
    const fillRight = (gapX - offsetX) + PANEL_BORDER_HALF;
    const fillTop = offsetY + PANEL_BORDER_HALF;
    const fillBottom = (gapY - offsetY) + PANEL_BORDER_HALF;

    const maxEdgeFillX = Math.max(fillLeft, fillRight);
    const maxEdgeFillY = Math.max(fillTop, fillBottom);

    const maxUnitsEdgeX = Math.max(1, Math.floor((MAX_PRINT_BED - maxEdgeFillX - PANEL_BORDER_HALF) / GRID_PITCH));
    const maxUnitsEdgeY = Math.max(1, Math.floor((MAX_PRINT_BED - maxEdgeFillY - PANEL_BORDER_HALF) / GRID_PITCH));
    const maxUnitsX = Math.min(5, maxUnitsEdgeX);
    const maxUnitsY = Math.min(5, maxUnitsEdgeY);

    const singleFitsX = fillLeft + unitsX * GRID_PITCH + fillRight <= MAX_PRINT_BED;
    const singleFitsY = fillTop + unitsY * GRID_PITCH + fillBottom <= MAX_PRINT_BED;
    const effectiveMaxX = singleFitsX ? maxUnitsX : Math.min(maxUnitsX, unitsX - 1);
    const effectiveMaxY = singleFitsY ? maxUnitsY : Math.min(maxUnitsY, unitsY - 1);

    const partsX = partitionWithConnectors(unitsX, effectiveMaxX);
    const partsY = partitionWithConnectors(unitsY, effectiveMaxY);

    const cols = partsX.length;
    const rows = partsY.length;

    const colStarts = [0];
    for (let c = 0; c < cols; c++) {
        colStarts.push(colStarts[c] + partsX[c] + (c < cols - 1 ? 1 : 0));
    }
    const rowStarts = [0];
    for (let r = 0; r < rows; r++) {
        rowStarts.push(rowStarts[r] + partsY[r] + (r < rows - 1 ? 1 : 0));
    }

    const panels = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const nx = partsX[c];
            const ny = partsY[r];
            const edgeFills = { left: 0, right: 0, top: 0, bottom: 0 };
            if (c === 0) edgeFills.left = fillLeft;
            if (c === cols - 1) edgeFills.right = fillRight;
            if (r === 0) edgeFills.top = fillTop;
            if (r === rows - 1) edgeFills.bottom = fillBottom;

            const hasLeftBorder = c > 0;
            const hasRightBorder = c < cols - 1;
            const hasTopBorder = r > 0;
            const hasBottomBorder = r < rows - 1;

            const borderL = hasLeftBorder ? PANEL_BORDER_HALF : 0;
            const borderR = hasRightBorder ? PANEL_BORDER_HALF : 0;
            const borderT = hasTopBorder ? PANEL_BORDER_HALF : 0;
            const borderB = hasBottomBorder ? PANEL_BORDER_HALF : 0;
            const panelW = borderL + GRID_PITCH * nx + borderR + edgeFills.left + edgeFills.right;
            const panelH = borderT + GRID_PITCH * ny + borderB + edgeFills.top + edgeFills.bottom;

            panels.push({
                row: r, col: c, nx, ny,
                panelW, panelH,
                totalW: panelW, totalH: panelH,
                edgeFills,
                gridOffsetX: colStarts[c],
                gridOffsetY: rowStarts[r],
                hasLeftBorder, hasRightBorder, hasTopBorder, hasBottomBorder,
            });
        }
    }

    const vStrips = cols - 1;
    const hStrips = rows - 1;

    const vStripSegments = vStrips > 0 ? partitionStripCells(unitsY, fillTop, fillBottom) : [];
    const hStripSegments = hStrips > 0 ? partitionStripCells(unitsX, fillLeft, fillRight) : [];

    const connectorCellsV = vStrips * unitsY;
    const connectorCellsH = hStrips * unitsX;

    return {
        panels, partsX, partsY, rows, cols,
        colStarts, rowStarts,
        vStrips, hStrips,
        vStripSegments, hStripSegments,
        connectorCellsV, connectorCellsH,
        fillLeft, fillRight, fillTop, fillBottom,
    };
}
