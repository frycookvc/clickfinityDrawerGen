// ============================================================
// Three.js Preview
// ============================================================
let scene, camera, renderer, controls;

function initPreview() {
    const container = document.getElementById('preview-container');
    const w = container.clientWidth;
    const h = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1b3e);

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
    camera.position.set(0, -400, 500);
    camera.up.set(0, 0, 1);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, -200, 300);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-100, 200, 200);
    scene.add(dirLight2);
    scene.add(new THREE.AmbientLight(0x404060, 0.5));

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        const w2 = container.clientWidth;
        const h2 = container.clientHeight;
        camera.aspect = w2 / h2;
        camera.updateProjectionMatrix();
        renderer.setSize(w2, h2);
    });
}

function clearPreview() {
    if (!scene) return;
    while (scene.children.length > 0) {
        const obj = scene.children[0];
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        scene.remove(obj);
    }
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, -200, 300);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-100, 200, 200);
    scene.add(dirLight2);
    scene.add(new THREE.AmbientLight(0x404060, 0.5));
}

const PANEL_COLORS = [0x4488cc, 0x44aa88, 0xcc8844, 0x8844cc, 0xcc4488, 0x88cc44];

function addPanelToPreview(triangles, panelIndex, posX, posY) {
    const positions = new Float32Array(triangles.length * 9);
    for (let i = 0; i < triangles.length; i++) {
        for (let j = 0; j < 3; j++) {
            positions[i * 9 + j * 3] = triangles[i][j][0];
            positions[i * 9 + j * 3 + 1] = triangles[i][j][1];
            positions[i * 9 + j * 3 + 2] = triangles[i][j][2];
        }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    const color = PANEL_COLORS[panelIndex % PANEL_COLORS.length];
    const mat = new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, flatShading: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(posX, posY, 0);
    scene.add(mesh);
}

function addDrawerOutline(width, depth) {
    const hw = width / 2, hd = depth / 2;
    const points = [
        new THREE.Vector3(-hw, -hd, -2),
        new THREE.Vector3(hw, -hd, -2),
        new THREE.Vector3(hw, hd, -2),
        new THREE.Vector3(-hw, hd, -2),
        new THREE.Vector3(-hw, -hd, -2),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
    scene.add(new THREE.Line(geom, mat));
}

function addConnectorMarkers(layout, grid) {
    const { partsX, partsY, rows, cols, colStarts, rowStarts } = layout;

    const gridHalfW = GRID_PITCH * grid.unitsX / 2;
    const gridHalfH = GRID_PITCH * grid.unitsY / 2;
    const shiftX = -(layout.fillRight - layout.fillLeft) / 2;
    const shiftY = -(layout.fillBottom - layout.fillTop) / 2;

    function unitCenterX(u) { return -gridHalfW + (u + 0.5) * GRID_PITCH + shiftX; }
    function unitCenterY(u) { return -gridHalfH + (u + 0.5) * GRID_PITCH + shiftY; }
    function connColX(c) {
        const connUnit = colStarts[c + 1] - 1;
        return unitCenterX(connUnit);
    }
    function connRowY(r) {
        const connUnit = rowStarts[r + 1] - 1;
        return unitCenterY(connUnit);
    }

    const connMat = new THREE.MeshPhongMaterial({ color: 0xffcc00, transparent: true, opacity: 0.4 });

    for (let c = 0; c < cols - 1; c++) {
        const cx = connColX(c);
        for (let u = 0; u < grid.unitsY; u++) {
            const cy = unitCenterY(u);
            const geom = new THREE.BoxGeometry(GRID_PITCH * 0.9, GRID_PITCH * 0.9, 5);
            const m = new THREE.Mesh(geom, connMat);
            m.position.set(cx, cy, 1);
            scene.add(m);
        }
    }

    for (let r = 0; r < rows - 1; r++) {
        const cy = connRowY(r);
        for (let u = 0; u < grid.unitsX; u++) {
            const cx = unitCenterX(u);
            const geom = new THREE.BoxGeometry(GRID_PITCH * 0.9, GRID_PITCH * 0.9, 5);
            const m = new THREE.Mesh(geom, connMat);
            m.position.set(cx, cy, 1);
            scene.add(m);
        }
    }
}
