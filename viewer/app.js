import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Configuration
const urlParams = new URLSearchParams(window.location.search);
const SCENE_PATH = urlParams.get('scene') || '../data/products/real/area5_3d/scene.json';

// Globals
let scene, camera, renderer, orbitControls, flyControls, raycaster, mouse;
let currentMode = 'orbit'; // orbit, fly, walk
let terrainChunks = [];
let clock = new THREE.Clock();
let terrainBounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
let terrainScale = 100;
let terrainBox = new THREE.Box3();
let loadedTerrainChunks = 0;
let expectedTerrainChunks = 0;
let terrainFramed = false;

// Movement state for fly/walk
const moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const SPEED = 12.0;

// Listen for view controls from the parent React app
window.addEventListener('message', (event) => {
    if (event.data?.type === 'SET_EXAGGERATION') {
        const scale = event.data.value;
        terrainChunks.forEach(mesh => {
            mesh.scale.set(1, scale, 1);
            mesh.updateMatrix();
        });
    }
});

init();
animate();

async function init() {
    // 1. Setup Scene
    const container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.001);

    // 2. Setup Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

    // 3. Setup Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1000, 2000, 1000);
    scene.add(dirLight);

    // 4. Setup Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // 5. Setup Controls
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.01; // Don't go below ground

    flyControls = new PointerLockControls(camera, document.body);

    // 6. Setup Raycaster for Inspector
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    renderer.domElement.addEventListener('click', (e) => {
        if (currentMode === 'orbit') {
            inspectPoint(e.clientX, e.clientY);
        } else {
            flyControls.lock();
        }
    });

    setupUI();

    // 8. Load Terrain Data
    await loadTerrain();
}

async function loadTerrain() {
    try {
        const response = await fetch(SCENE_PATH);
        const manifest = await response.json();

        // The mesh is exported in metres. Match the camera and controls to the
        // actual footprint instead of assuming a fixed world size.
        const halfWidth = Number(manifest.width_m || 200) / 2;
        const halfHeight = Number(manifest.height_m || 200) / 2;
        terrainBounds = {
            minX: -halfWidth,
            maxX: halfWidth,
            minZ: -halfHeight,
            maxZ: halfHeight,
        };
        terrainScale = Math.max(halfWidth, halfHeight);
        expectedTerrainChunks = manifest.chunks.length;
        const viewHeight = Math.max(35, terrainScale * 0.9);
        camera.position.set(0, viewHeight, viewHeight * 0.9);
        orbitControls.target.set(0, 0, 0);
        orbitControls.minDistance = Math.max(4, terrainScale * 0.03);
        orbitControls.maxDistance = terrainScale * 2.2;
        orbitControls.update();

        const loader = new GLTFLoader();
        const basePath = SCENE_PATH.substring(0, SCENE_PATH.lastIndexOf('/') + 1);

        // Setup LOD for each chunk
        for (const chunk of manifest.chunks) {
            const lod = new THREE.LOD();

            // High detail (LOD0)
            loader.load(basePath + chunk.lods["0"], (gltf) => {
                const mesh = gltf.scene;
                mesh.position.fromArray(chunk.position);
                lod.addLevel(mesh, 0); // Active when distance < 800
                terrainChunks.push(mesh); // for raycasting
                terrainBox.expandByObject(mesh);
                loadedTerrainChunks += 1;
                // Frame as soon as the first real mesh arrives. Waiting for
                // every optional LOD chunk can leave the camera at fallback
                // coordinates if one request is slow or fails.
                if (!terrainFramed) {
                    terrainFramed = true;
                    frameTerrain();
                }
            });

            // Medium detail (LOD1)
            loader.load(basePath + chunk.lods["1"], (gltf) => {
                const mesh = gltf.scene;
                mesh.position.fromArray(chunk.position);
                lod.addLevel(mesh, 800); // Active when distance >= 800
            });

            scene.add(lod);
        }

    } catch (e) {
        console.error("Failed to load scene data:", e);
    }
}

function frameTerrain() {
    if (terrainBox.isEmpty()) return;

    const center = new THREE.Vector3(0, terrainBox.getCenter(new THREE.Vector3()).y, 0);
    const horizontalSpan = Math.max(
        terrainBounds.maxX - terrainBounds.minX,
        terrainBounds.maxZ - terrainBounds.minZ
    );
    const viewingDistance = Math.max(35, horizontalSpan * 0.85);
    const terrainTop = terrainBox.max.y;

    terrainScale = Math.max(terrainScale, horizontalSpan / 2);
    camera.near = 0.1;
    camera.far = Math.max(2000, viewingDistance * 8);
    camera.position.set(
        center.x,
        terrainTop + viewingDistance * 0.7,
        center.z + viewingDistance * 0.85
    );
    orbitControls.target.copy(center);
    orbitControls.minDistance = Math.max(4, horizontalSpan * 0.03);
    orbitControls.maxDistance = viewingDistance * 3;
    orbitControls.update();
}

function setupUI() {
    const btnOrbit = document.getElementById('btn-orbit');
    const btnFly = document.getElementById('btn-fly');
    const btnWalk = document.getElementById('btn-walk');
    const crosshair = document.getElementById('crosshair');
    const instructions = document.getElementById('fly-instructions');

    const setMode = (mode) => {
        currentMode = mode;
        btnOrbit.className = mode === 'orbit' ? 'active' : '';
        btnFly.className = mode === 'fly' ? 'active' : '';
        btnWalk.className = mode === 'walk' ? 'active' : '';

        if (mode === 'orbit') {
            flyControls.unlock();
            orbitControls.enabled = true;
            crosshair.style.display = 'none';
            instructions.style.display = 'none';
        } else {
            orbitControls.enabled = false;
            flyControls.lock();
            crosshair.style.display = 'block';
            instructions.style.display = 'block';
        }
    };

    btnOrbit.addEventListener('click', () => setMode('orbit'));
    btnFly.addEventListener('click', () => setMode('fly'));
    btnWalk.addEventListener('click', () => setMode('walk'));
}

function onKeyDown(event) {
    if (currentMode === 'orbit') return;
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveState.forward = true; break;
        case 'ArrowLeft': case 'KeyA': moveState.left = true; break;
        case 'ArrowDown': case 'KeyS': moveState.backward = true; break;
        case 'ArrowRight': case 'KeyD': moveState.right = true; break;
        case 'KeyE': moveState.up = true; break;
        case 'KeyQ': moveState.down = true; break;
    }
}

function onKeyUp(event) {
    if (currentMode === 'orbit') return;
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveState.forward = false; break;
        case 'ArrowLeft': case 'KeyA': moveState.left = false; break;
        case 'ArrowDown': case 'KeyS': moveState.backward = false; break;
        case 'ArrowRight': case 'KeyD': moveState.right = false; break;
        case 'KeyE': moveState.up = false; break;
        case 'KeyQ': moveState.down = false; break;
    }
}

function inspectPoint(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(terrainChunks, true);

    if (intersects.length > 0) {
        const point = intersects[0].point;
        // In our coordinate system:
        // X = Easting offset
        // Y = Elevation
        // Z = Northing offset (inverted)

        document.getElementById('val-elev').innerText = point.y.toFixed(2);
        document.getElementById('val-latlon').innerText = `X: ${point.x.toFixed(1)}, Y: ${-point.z.toFixed(1)}`;
    }
}

function getTerrainHeightAt(x, z) {
    // Simple vertical raycast to find terrain height
    const origin = new THREE.Vector3(x, 2000, z);
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
    const intersects = ray.intersectObjects(terrainChunks, true);

    if (intersects.length > 0) {
        return intersects[0].point.y;
    }
    return 0;
}

function updateMovement(delta) {
    if (currentMode === 'orbit') return;
    if (!flyControls.isLocked) return;

    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= velocity.y * 10.0 * delta;

    direction.z = Number(moveState.forward) - Number(moveState.backward);
    direction.x = Number(moveState.right) - Number(moveState.left);
    direction.normalize();

    if (moveState.forward || moveState.backward) velocity.z -= direction.z * SPEED * delta;
    if (moveState.left || moveState.right) velocity.x -= direction.x * SPEED * delta;

    if (currentMode === 'fly') {
        if (moveState.up) velocity.y += SPEED * 0.5 * delta;
        if (moveState.down) velocity.y -= SPEED * 0.5 * delta;
    }

    flyControls.moveRight(-velocity.x);
    flyControls.moveForward(-velocity.z);

    const pos = camera.position;
    const margin = Math.max(1, terrainScale * 0.015);
    pos.x = THREE.MathUtils.clamp(pos.x, terrainBounds.minX + margin, terrainBounds.maxX - margin);
    pos.z = THREE.MathUtils.clamp(pos.z, terrainBounds.minZ + margin, terrainBounds.maxZ - margin);

    if (currentMode === 'fly') {
        pos.y = THREE.MathUtils.clamp(
            pos.y + velocity.y,
            terrainBox.isEmpty() ? 5 : terrainBox.min.y + 3,
            terrainBox.isEmpty() ? terrainScale * 1.5 : terrainBox.max.y + terrainScale
        );
    } else if (currentMode === 'walk') {
        // Stick to terrain
        const th = getTerrainHeightAt(pos.x, pos.z);
        pos.y = th + 2.0; // 2 meters above ground
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (currentMode === 'orbit') {
        orbitControls.update();
        const margin = Math.max(1, terrainScale * 0.015);
        orbitControls.target.x = THREE.MathUtils.clamp(
            orbitControls.target.x,
            terrainBounds.minX + margin,
            terrainBounds.maxX - margin
        );
        orbitControls.target.z = THREE.MathUtils.clamp(
            orbitControls.target.z,
            terrainBounds.minZ + margin,
            terrainBounds.maxZ - margin
        );
    } else {
        updateMovement(delta);
    }

    renderer.render(scene, camera);
}
