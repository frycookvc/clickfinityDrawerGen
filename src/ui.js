// ============================================================
// Global State
// ============================================================
let currentLayout = null;
let generatedFiles = null;
let generatedPanelTris = [];
let generatedStripTris = [];
let generatedConnectorTris = [];

// ============================================================
// Summary Stats
// ============================================================
function showStats(grid, layout) {
    const { unitsX, unitsY, gapX, gapY } = grid;
    const { panels, partsX, partsY, rows, cols, vStrips, hStrips, fillLeft, fillRight, fillTop, fillBottom } = layout;

    const totalPanels = panels.length;
    const totalConnStrips = vStrips + hStrips;

    const sizeCounts = {};
    for (const p of panels) {
        const key = `${p.nx}x${p.ny}`;
        sizeCounts[key] = (sizeCounts[key] || 0) + 1;
    }
    const sizeStr = Object.entries(sizeCounts).map(([k,v]) => `${v}x ${k}`).join(', ');

    let html = '';
    html += `<div class="stat-row"><span class="label">Grid</span><span class="value">${unitsX} x ${unitsY} cells</span></div>`;
    html += `<div class="stat-row"><span class="label">Panels</span><span class="value">${totalPanels} (${sizeStr})</span></div>`;
    html += `<div class="stat-row"><span class="label">Layout</span><span class="value">${cols}C x ${rows}R panels</span></div>`;
    html += `<div class="stat-row"><span class="label">Strips</span><span class="value">${totalConnStrips} (${vStrips}V + ${hStrips}H)</span></div>`;
    if (vStrips > 0) {
        const vSegInfo = layout.vStripSegments.length > 1 ? `, ${layout.vStripSegments.length} segments` : '';
        html += `<div class="stat-row"><span class="label">V-Strip Cells</span><span class="value">${unitsY} cells each (${unitsY} joiners)${vSegInfo}</span></div>`;
    }
    if (hStrips > 0) {
        const hSegInfo = layout.hStripSegments.length > 1 ? `, ${layout.hStripSegments.length} segments` : '';
        html += `<div class="stat-row"><span class="label">H-Strip Cells</span><span class="value">${unitsX} cells each (${unitsX} joiners)${hSegInfo}</span></div>`;
    }
    html += `<div class="stat-row"><span class="label">Edge Gap</span><span class="value">${gapX.toFixed(1)} x ${gapY.toFixed(1)} mm</span></div>`;
    if (fillLeft > 0.01 || fillRight > 0.01 || fillTop > 0.01 || fillBottom > 0.01) {
        html += `<div class="stat-row"><span class="label">Edge Fill</span><span class="value">L:${fillLeft.toFixed(1)} R:${fillRight.toFixed(1)} T:${fillTop.toFixed(1)} B:${fillBottom.toFixed(1)}</span></div>`;
    }

    document.getElementById('stats-content').innerHTML = html;
    document.getElementById('stats-panel').style.display = '';

    let detailHtml = '';
    for (const p of panels) {
        const fills = [];
        if (p.edgeFills.left > 0.01) fills.push(`L:${p.edgeFills.left.toFixed(1)}`);
        if (p.edgeFills.right > 0.01) fills.push(`R:${p.edgeFills.right.toFixed(1)}`);
        if (p.edgeFills.top > 0.01) fills.push(`T:${p.edgeFills.top.toFixed(1)}`);
        if (p.edgeFills.bottom > 0.01) fills.push(`B:${p.edgeFills.bottom.toFixed(1)}`);
        const fillStr = fills.length ? ` + fill ${fills.join(',')}` : '';
        detailHtml += `<div class="panel-item">plate_r${p.row}_c${p.col}.stl: ${p.nx}x${p.ny} (${p.totalW.toFixed(1)}x${p.totalH.toFixed(1)}mm)${fillStr}</div>`;
    }
    if (vStrips > 0 || hStrips > 0) {
        let connDesc = 'connectors.stl: all connector & edge strips (';
        const parts = [];
        if (vStrips > 0) parts.push(`${vStrips}V × ${unitsY} cells`);
        if (hStrips > 0) parts.push(`${hStrips}H × ${unitsX} cells`);
        connDesc += parts.join(', ') + ')';
        detailHtml += `<div class="panel-item">${connDesc}</div>`;
    }
    document.getElementById('panel-details').innerHTML = detailHtml;
    document.getElementById('panel-list').style.display = '';
}

// ============================================================
// Main Generate Function
// ============================================================
async function generate() {
    const width = parseFloat(document.getElementById('inp-width').value);
    const depth = parseFloat(document.getElementById('inp-depth').value);
    const alignment = document.getElementById('inp-align').value;
    const tabOffset = parseFloat(document.getElementById('inp-offset').value);
    const statusEl = document.getElementById('status');

    if (isNaN(width) || width < 55 || width > 2000 || isNaN(depth) || depth < 55 || depth > 2000) {
        statusEl.textContent = 'Invalid dimensions. Width/depth must be 55-2000mm.';
        return;
    }

    const grid = calculateGrid(width, depth, alignment);
    if (!grid) {
        statusEl.textContent = 'Drawer too small - cannot fit any grid units.';
        return;
    }

    const layout = computeLayout(grid);
    currentLayout = layout;
    generatedFiles = {};
    generatedPanelTris = [];
    generatedStripTris = [];
    generatedConnectorTris = [];

    const btn = document.getElementById('btn-generate');
    btn.disabled = true;
    statusEl.textContent = 'Calculating layout...';

    showStats(grid, layout);

    if (!renderer) initPreview();
    clearPreview();
    addDrawerOutline(width, depth);

    const gridHalfW = GRID_PITCH * grid.unitsX / 2;
    const gridHalfH = GRID_PITCH * grid.unitsY / 2;

    const { panels, partsX, partsY, rows, cols, colStarts, rowStarts, vStrips, hStrips } = layout;

    // Crossing positions: grid units where perpendicular connector strips exist
    const hConnRows = [];
    for (let r = 0; r < rows - 1; r++) hConnRows.push(rowStarts[r + 1] - 1);
    const vConnCols = [];
    for (let c = 0; c < cols - 1; c++) vConnCols.push(colStarts[c + 1] - 1);

    const drawerShiftX = -(layout.fillRight - layout.fillLeft) / 2;
    const drawerShiftY = -(layout.fillBottom - layout.fillTop) / 2;

    clearCellMeshCache();

    for (let idx = 0; idx < panels.length; idx++) {
        const p = panels[idx];
        statusEl.textContent = `Generating panel ${idx + 1} of ${panels.length}...`;
        await new Promise(r => setTimeout(r, 10));

        const tris = generatePanelTriangles(p);
        const stl = writeBinarySTL(tris);
        const filename = `plate_r${p.row}_c${p.col}.stl`;
        generatedFiles[filename] = stl;

        const startUX = colStarts[p.col];
        const midUX = startUX + p.nx / 2;
        const startUY = rowStarts[p.row];
        const midUY = startUY + p.ny / 2;

        const cellCenterX = -gridHalfW + midUX * GRID_PITCH;
        const cellCenterY = -gridHalfH + midUY * GRID_PITCH;

        const leftEdge = p.hasLeftBorder ? PANEL_BORDER_HALF : 0;
        const rightEdge = p.hasRightBorder ? PANEL_BORDER_HALF : 0;
        const topEdge = p.hasTopBorder ? PANEL_BORDER_HALF : 0;
        const bottomEdge = p.hasBottomBorder ? PANEL_BORDER_HALF : 0;
        const meshShiftX = (p.edgeFills.right + rightEdge - p.edgeFills.left - leftEdge) / 2;
        const meshShiftY = (p.edgeFills.bottom + bottomEdge - p.edgeFills.top - topEdge) / 2;

        const worldX = cellCenterX + meshShiftX + drawerShiftX;
        const worldY = cellCenterY + meshShiftY + drawerShiftY;
        generatedPanelTris.push({ panel: p, tris, worldX, worldY });

        addPanelToPreview(tris, idx, worldX, worldY);
    }

    // Generate connector & edge strips
    const vSegs = layout.vStripSegments;
    const hSegs = layout.hStripSegments;
    const totalStrips = vStrips + hStrips;
    let stripIdx = 0;
    let previewIdx = panels.length;
    const allConnectorTris = [];

    // Vertical strips (between panel columns)
    for (let c = 0; c < vStrips; c++) {
        let cellOffset = 0;
        for (let s = 0; s < vSegs.length; s++) {
            const seg = vSegs[s];
            statusEl.textContent = `Generating strip ${stripIdx + 1} of ${totalStrips}...`;
            await new Promise(r => setTimeout(r, 10));

            const skipV = new Set();
            for (const row of hConnRows) {
                const local = row - cellOffset;
                if (local >= 0 && local < seg.cells) skipV.add(local);
            }

            const strip = generateConnectorStrip(seg.cells, tabOffset, 'vertical',
                seg.fillStart, seg.fillEnd, skipV);

            const connUnit = colStarts[c + 1] - 1;
            const posX = -gridHalfW + (connUnit + 0.5) * GRID_PITCH + drawerShiftX;
            const segMidCell = cellOffset + seg.cells / 2;
            const fullMidCell = grid.unitsY / 2;
            const posY = (segMidCell - fullMidCell) * GRID_PITCH + drawerShiftY;
            addPanelToPreview(strip, previewIdx++, posX, posY);

            generatedStripTris.push({
                name: `vstrip_c${c}_s${s}`,
                tris: strip,
                worldX: posX,
                worldY: posY
            });

            for (const tri of strip) {
                allConnectorTris.push([
                    [tri[0][0] + posX, tri[0][1] + posY, tri[0][2]],
                    [tri[1][0] + posX, tri[1][1] + posY, tri[1][2]],
                    [tri[2][0] + posX, tri[2][1] + posY, tri[2][2]],
                ]);
            }

            cellOffset += seg.cells;
        }
        stripIdx++;
    }

    // Horizontal strips (between panel rows)
    for (let r = 0; r < hStrips; r++) {
        let cellOffset = 0;
        for (let s = 0; s < hSegs.length; s++) {
            const seg = hSegs[s];
            statusEl.textContent = `Generating strip ${stripIdx + 1} of ${totalStrips}...`;
            await new Promise(r => setTimeout(r, 10));

            const skipH = new Set();
            for (const col of vConnCols) {
                const local = col - cellOffset;
                if (local >= 0 && local < seg.cells) skipH.add(local);
            }

            const strip = generateConnectorStrip(seg.cells, tabOffset, 'horizontal',
                seg.fillStart, seg.fillEnd, skipH);

            const connUnit = rowStarts[r + 1] - 1;
            const segMidCell = cellOffset + seg.cells / 2;
            const fullMidCell = grid.unitsX / 2;
            const posX = (segMidCell - fullMidCell) * GRID_PITCH + drawerShiftX;
            const posY = -gridHalfH + (connUnit + 0.5) * GRID_PITCH + drawerShiftY;
            addPanelToPreview(strip, previewIdx++, posX, posY);

            generatedStripTris.push({
                name: `hstrip_r${r}_s${s}`,
                tris: strip,
                worldX: posX,
                worldY: posY
            });

            for (const tri of strip) {
                allConnectorTris.push([
                    [tri[0][0] + posX, tri[0][1] + posY, tri[0][2]],
                    [tri[1][0] + posX, tri[1][1] + posY, tri[1][2]],
                    [tri[2][0] + posX, tri[2][1] + posY, tri[2][2]],
                ]);
            }

            cellOffset += seg.cells;
        }
        stripIdx++;
    }

    if (allConnectorTris.length > 0) {
        generatedFiles['connectors.stl'] = writeBinarySTL(allConnectorTris);
        generatedConnectorTris = allConnectorTris;
    }

    addConnectorMarkers(layout, grid);

    const maxDim = Math.max(width, depth);
    camera.position.set(0, -maxDim * 0.3, maxDim * 0.9);
    controls.target.set(0, 0, 0);
    controls.update();

    statusEl.textContent = `Done! ${panels.length} panels` + (totalStrips > 0 ? `, ${totalStrips} strips (1 file).` : '.');
    document.getElementById('btn-download').disabled = false;
    document.getElementById('btn-download-3mf').disabled = false;
    document.getElementById('slicer-panel').style.display = '';
    btn.disabled = false;
}

// ============================================================
// ZIP Download
// ============================================================
async function downloadZip() {
    if (!generatedFiles) return;
    const width = document.getElementById('inp-width').value;
    const depth = document.getElementById('inp-depth').value;
    const folderName = `clickfinity_${width}x${depth}`;

    const zip = new JSZip();
    const folder = zip.folder(folderName);
    for (const [name, data] of Object.entries(generatedFiles)) {
        folder.file(name, data);
    }

    // Add README
    let info = `ClickFinity Baseplate Generator\n`;
    info += `Drawer: ${width} x ${depth} mm\n\n`;
    info += `Print each plate_*.stl once.\n`;
    info += `Print connectors.stl once — it contains all connector & edge strips.\n`;
    info += `\nRecommended: ABS/PETG, 0.20mm layer, 15-20% infill, 3 walls, no supports.\n`;

    folder.file('README.txt', info);

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${folderName}.zip`);
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    for (const id of ['inp-width', 'inp-depth', 'inp-thickness', 'inp-offset']) {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') generate();
        });
    }
});
