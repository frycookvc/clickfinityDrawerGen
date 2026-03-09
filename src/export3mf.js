// ============================================================
// 3MF Generation & Download (BambuStudio-compatible)
// ============================================================

// Deduplicate vertices using spatial hashing (round to 0.001mm)
function deduplicateVertices(triangles) {
    const vertexMap = new Map();
    const vertices = [];
    const indices = [];

    for (const tri of triangles) {
        const triIndices = [];
        for (const v of tri) {
            const key = `${Math.round(v[0] * 1000)},${Math.round(v[1] * 1000)},${Math.round(v[2] * 1000)}`;
            let idx = vertexMap.get(key);
            if (idx === undefined) {
                idx = vertices.length;
                vertexMap.set(key, idx);
                vertices.push([v[0], v[1], v[2]]);
            }
            triIndices.push(idx);
        }
        indices.push(triIndices);
    }

    return { vertices, indices };
}

// Simple UUID v4 generator for 3MF p:UUID attributes
function uuid4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// Compute axis-aligned bounding box from triangle vertices
function computeStripBounds(tris) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const tri of tris) {
        for (const v of tri) {
            if (v[0] < minX) minX = v[0];
            if (v[0] > maxX) maxX = v[0];
            if (v[1] < minY) minY = v[1];
            if (v[1] > maxY) maxY = v[1];
        }
    }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

// Rotate triangle vertices 90° CW in XY plane: (x,y) → (y, -x)
function rotateTrisCW90(tris) {
    return tris.map(tri => tri.map(v => [v[1], -v[0], v[2]]));
}

// Shelf-pack pre-measured strip items onto 256x256mm plates
function packStripsOntoPlates(items) {
    const PLATE_SIZE = 256;
    const GAP = 2;

    // Sort by effective height descending for better shelf packing
    items = items.slice().sort((a, b) => b.h - a.h);

    const placements = [];
    let plateIndex = 0;
    let shelfX = 0;
    let shelfY = 0;
    let shelfHeight = 0;

    for (const item of items) {
        // Check if strip fits in current row
        if (shelfX + item.w > PLATE_SIZE) {
            // Start new shelf row
            shelfX = 0;
            shelfY += shelfHeight + GAP;
            shelfHeight = 0;
        }
        // Check if new shelf fits on current plate
        if (shelfY + item.h > PLATE_SIZE) {
            // Start new plate
            plateIndex++;
            shelfX = 0;
            shelfY = 0;
            shelfHeight = 0;
        }

        placements.push({
            stripIndex: item.stripIndex,
            plateIndex,
            shelfX,
            shelfY,
            w: item.w,
            h: item.h,
            bounds: item.bounds
        });

        shelfX += item.w + GAP;
        if (item.h > shelfHeight) shelfHeight = item.h;
    }

    return placements;
}

function generate3MF(panelTrisArr, stripTrisArr) {
    const Z_SHIFT = -PANEL_Z_MIN; // shift so Z starts at 0 (= 2.0)

    // BambuStudio plate grid: 307mm pitch between plate centers (256mm bed + 51mm gap)
    const PLATE_PITCH = 307;
    const PLATE_CENTER = 128; // center of first plate (half of 256mm bed)

    // Build objects: one per panel + one per strip segment
    const objects = [];
    for (const pt of panelTrisArr) {
        objects.push({
            name: `plate_r${pt.panel.row}_c${pt.panel.col}`,
            tris: pt.tris
        });
    }

    // Build strip objects with pre-rotation: rotate vertical strips so all are horizontal in mesh data
    const stripItems = []; // for packing: { stripIndex, bounds, w, h }
    for (let si = 0; si < stripTrisArr.length; si++) {
        const st = stripTrisArr[si];
        let tris = st.tris;
        let bounds = computeStripBounds(tris);
        if (bounds.height > bounds.width) {
            tris = rotateTrisCW90(tris);
            bounds = computeStripBounds(tris);
        }
        objects.push({ name: st.name, tris });
        stripItems.push({ stripIndex: si, bounds, w: bounds.width, h: bounds.height });
    }

    const buildUuid = uuid4();

    // ── 3D/3dmodel.model ──
    let model = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    model += `<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" `;
    model += `xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" `;
    model += `xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" `;
    model += `requiredextensions="p">\n`;
    model += ` <metadata name="BambuStudio:3mfVersion">1</metadata>\n`;
    model += ` <resources>\n`;

    const objectUuids = [];
    const triCounts = [];

    for (let oi = 0; oi < objects.length; oi++) {
        const obj = objects[oi];
        const id = oi + 1;
        const objUuid = uuid4();
        objectUuids.push(objUuid);
        const { vertices, indices } = deduplicateVertices(obj.tris);
        triCounts.push(obj.tris.length);

        model += `  <object id="${id}" p:UUID="${objUuid}" type="model" name="${obj.name}">\n`;
        model += `   <mesh>\n`;
        model += `    <vertices>\n`;
        for (const v of vertices) {
            model += `     <vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>\n`;
        }
        model += `    </vertices>\n`;
        model += `    <triangles>\n`;
        for (const tri of indices) {
            model += `     <triangle v1="${tri[0]}" v2="${tri[1]}" v3="${tri[2]}"/>\n`;
        }
        model += `    </triangles>\n`;
        model += `   </mesh>\n`;
        model += `  </object>\n`;
    }
    model += ` </resources>\n`;

    const numPanels = panelTrisArr.length;
    const numStrips = stripTrisArr.length;
    const panelGridCols = Math.max(1, Math.ceil(Math.sqrt(numPanels)));

    // ── Panel positions: one panel per plate cell, arranged in a grid ──
    const positions = []; // { transform }
    for (let i = 0; i < numPanels; i++) {
        const col = i % panelGridCols;
        const row = Math.floor(i / panelGridCols);
        const tx = PLATE_CENTER + col * PLATE_PITCH;
        const ty = PLATE_CENTER - row * PLATE_PITCH;
        positions.push({ transform: `1 0 0 0 1 0 0 0 1 ${tx} ${ty} ${Z_SHIFT}` });
    }

    // ── Strip packing ──
    const packResults = numStrips > 0 ? packStripsOntoPlates(stripItems) : [];
    const numStripPlates = packResults.length > 0
        ? Math.max(...packResults.map(p => p.plateIndex)) + 1
        : 0;

    // Build a map from stripIndex to its placement
    const stripPlacement = new Array(numStrips);
    for (const p of packResults) {
        stripPlacement[p.stripIndex] = p;
    }

    // Compute strip positions from packing results
    // Strip plates go after the panel grid in BambuStudio's plate layout
    const panelGridRows = Math.ceil(numPanels / panelGridCols);

    for (let si = 0; si < numStrips; si++) {
        const p = stripPlacement[si];
        const b = p.bounds;
        // Position this strip's plate in the BambuStudio grid after the panel plates
        const plateCol = p.plateIndex % panelGridCols;
        const plateRow = panelGridRows + Math.floor(p.plateIndex / panelGridCols);
        // Left/bottom edge of this plate in 3MF world coords
        const plateOffX = plateCol * PLATE_PITCH;
        const plateOffY = -(plateRow) * PLATE_PITCH;

        // All strips use identity transform — mesh data is already pre-rotated
        const tx = plateOffX + p.shelfX - b.minX;
        const ty = plateOffY + p.shelfY - b.minY;
        positions.push({
            transform: `1 0 0 0 1 0 0 0 1 ${tx} ${ty} ${Z_SHIFT}`
        });
    }

    model += ` <build p:UUID="${buildUuid}">\n`;
    for (let oi = 0; oi < objects.length; oi++) {
        const itemUuid = uuid4();
        model += `  <item objectid="${oi + 1}" p:UUID="${itemUuid}" `;
        model += `transform="${positions[oi].transform}" printable="1"/>\n`;
    }
    model += ` </build>\n`;
    model += `</model>`;

    // ── Metadata/model_settings.config ──
    let modelSettings = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n`;

    // Object definitions
    for (let oi = 0; oi < objects.length; oi++) {
        const obj = objects[oi];
        const id = oi + 1;
        modelSettings += `  <object id="${id}">\n`;
        modelSettings += `    <metadata key="name" value="${obj.name}"/>\n`;
        modelSettings += `    <part id="${id}" subtype="normal_part">\n`;
        modelSettings += `      <metadata key="name" value="${obj.name}"/>\n`;
        modelSettings += `      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n`;
        modelSettings += `      <metadata key="source_object_id" value="${oi}"/>\n`;
        modelSettings += `      <metadata key="source_volume_id" value="0"/>\n`;
        modelSettings += `      <metadata key="source_offset_x" value="0"/>\n`;
        modelSettings += `      <metadata key="source_offset_y" value="0"/>\n`;
        modelSettings += `      <metadata key="source_offset_z" value="0"/>\n`;
        modelSettings += `    </part>\n`;
        modelSettings += `  </object>\n`;
    }

    // Plate definitions: one plate per panel, then packed strip plates
    // Group strips by their packed plate index
    const stripsByPlate = new Map();
    for (let si = 0; si < numStrips; si++) {
        const pi = stripPlacement[si].plateIndex;
        if (!stripsByPlate.has(pi)) stripsByPlate.set(pi, []);
        stripsByPlate.get(pi).push(si);
    }

    const totalPlates = numPanels + numStripPlates;
    for (let pi = 0; pi < totalPlates; pi++) {
        const plateIdx = pi + 1;
        if (pi < numPanels) {
            // Panel plate — one object
            const obj = objects[pi];
            const objId = pi + 1;
            modelSettings += `  <plate>\n`;
            modelSettings += `    <metadata key="plater_id" value="${plateIdx}"/>\n`;
            modelSettings += `    <metadata key="plater_name" value="${obj.name}"/>\n`;
            modelSettings += `    <metadata key="locked" value="false"/>\n`;
            modelSettings += `    <model_instance>\n`;
            modelSettings += `      <metadata key="object_id" value="${objId}"/>\n`;
            modelSettings += `      <metadata key="instance_id" value="0"/>\n`;
            modelSettings += `      <metadata key="identify_id" value="${objId}"/>\n`;
            modelSettings += `    </model_instance>\n`;
            modelSettings += `  </plate>\n`;
        } else {
            // Strip plate — strips packed onto this plate
            const stripPlateIdx = pi - numPanels;
            const stripsOnPlate = stripsByPlate.get(stripPlateIdx) || [];
            modelSettings += `  <plate>\n`;
            modelSettings += `    <metadata key="plater_id" value="${plateIdx}"/>\n`;
            modelSettings += `    <metadata key="plater_name" value="Connectors_${stripPlateIdx + 1}"/>\n`;
            modelSettings += `    <metadata key="locked" value="false"/>\n`;
            for (const si of stripsOnPlate) {
                const objId = numPanels + si + 1;
                modelSettings += `    <model_instance>\n`;
                modelSettings += `      <metadata key="object_id" value="${objId}"/>\n`;
                modelSettings += `      <metadata key="instance_id" value="0"/>\n`;
                modelSettings += `      <metadata key="identify_id" value="${objId}"/>\n`;
                modelSettings += `    </model_instance>\n`;
            }
            modelSettings += `  </plate>\n`;
        }
    }

    modelSettings += `</config>`;

    // ── Metadata/slice_info.config ──
    let sliceInfo = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n`;
    for (let pi = 0; pi < totalPlates; pi++) {
        sliceInfo += `  <plate>\n`;
        sliceInfo += `    <metadata key="index" value="${pi + 1}"/>\n`;
        if (pi < numPanels) {
            const obj = objects[pi];
            sliceInfo += `    <object identify_id="${pi + 1}" name="${obj.name}" skipped="false"/>\n`;
        } else {
            const stripPlateIdx = pi - numPanels;
            const stripsOnPlate = stripsByPlate.get(stripPlateIdx) || [];
            for (const si of stripsOnPlate) {
                const objId = numPanels + si + 1;
                const obj = objects[numPanels + si];
                sliceInfo += `    <object identify_id="${objId}" name="${obj.name}" skipped="false"/>\n`;
            }
        }
        sliceInfo += `  </plate>\n`;
    }
    sliceInfo += `</config>`;

    // ── Package files ──
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
        ` <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
        ` <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n` +
        `</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
        ` <Relationship Target="/3D/3dmodel.model" Id="rel-1" ` +
        `Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n` +
        `</Relationships>`;

    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.folder('_rels').file('.rels', rels);
    zip.folder('3D').file('3dmodel.model', model);
    zip.folder('Metadata').file('model_settings.config', modelSettings);
    zip.folder('Metadata').file('slice_info.config', sliceInfo);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
}

async function download3MF() {
    if (generatedPanelTris.length === 0) return;
    const width = document.getElementById('inp-width').value;
    const depth = document.getElementById('inp-depth').value;
    const blob = await generate3MF(generatedPanelTris, generatedStripTris);
    saveAs(blob, `clickfinity_${width}x${depth}.3mf`);
}
