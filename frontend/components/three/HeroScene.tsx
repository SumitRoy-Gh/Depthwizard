"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import * as THREE from "three";

/**
 * Interactive hero scene for the landing page.
 *
 * A "height-model" globe: continents rendered as a dot-matrix whose points are
 * displaced outward by an fbm terrain field — literally the product's promise
 * ("one image → 3D height model") as a single object. On top of it:
 *
 *   1. Ocean sphere (deep glass shading, fresnel rim)
 *   2. Dot-matrix land dots, displaced by terrain height (the DSM metaphor)
 *   3. A scan ring sweeping latitudes (the "pipeline pass")
 *   4. City nodes snapped onto land + animated comet arcs between them
 *   5. Cursor spotlight — dots brighten near the pointer (no raycasting)
 *   6. Star shell + atmosphere halo + a satellite on a tilted orbit ring
 *
 * Interaction: drag anywhere on the canvas to orbit (with inertia), wheel to
 * zoom (clamped + smoothed), idle auto-rotation. All pointer handling happens
 * on the gl.domElement itself (raycast-free), so the scene can never steal
 * events from React or the text column.
 *
 * Performance: all geometry is generated once at module init; per-frame work
 * is uniform updates only. Rendering pauses when the tab is hidden or the
 * hero scrolls out of view.
 */

// ---------------------------------------------------------------------------
// Noise (CPU, once at startup) — builds the terrain field for land dots
// ---------------------------------------------------------------------------

function makePerlin(seed = 1337) {
  const p = new Uint8Array(512);
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
  const src = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = src[i];
    src[i] = src[j];
    src[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = src[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number, z: number) => {
    h &= 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  return (x: number, y: number, z: number): number => {
    const X = Math.floor(x) & 255,
      Y = Math.floor(y) & 255,
      Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x),
      v = fade(y),
      w = fade(z);
    const A = p[X] + Y,
      AA = p[A] + Z,
      AB = p[A + 1] + Z,
      B = p[X + 1] + Y,
      BA = p[B] + Z,
      BB = p[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
        lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  };
}

const perlin = makePerlin(20260830);

function fbm(x: number, y: number, z: number, octaves = 5): number {
  let v = 0,
    a = 0.5,
    f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * perlin(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Land-dot generation — Fibonacci sphere, thresholded by continental field
// ---------------------------------------------------------------------------

const RADIUS = 1.6;
const LAND_THRESHOLD = 0.045;

type DotData = {
  positions: Float32Array; // displaced positions
  heights: Float32Array; // 0..1 normalized height
  sizes: Float32Array;
  count: number;
};

function generateLandDots(): DotData {
  const CANDIDATES = 46000;
  // Preallocate for the ~35% that pass the threshold
  const pos: number[] = [];
  const hgt: number[] = [];
  const sz: number[] = [];

  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < CANDIDATES; i++) {
    const y = 1 - (i / (CANDIDATES - 1)) * 2; // -1..1
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    const continent = fbm(x * 1.15, y * 1.15, z * 1.15, 4);
    if (continent <= LAND_THRESHOLD) continue;

    // Terrain height: ridged detail on top of the continental base
    const ridge = Math.max(0, fbm(x * 3.4 + 7.3, y * 3.4, z * 3.4, 4));
    const h = Math.min(1, (continent - LAND_THRESHOLD) * 3.2 + ridge * 0.85);

    const radius = RADIUS * (1 + h * 0.055);
    pos.push(x * radius, y * radius, z * radius);
    hgt.push(h);
    sz.push(0.62 + Math.random() * 0.75 + h * 0.5); // peaks slightly larger
  }

  return {
    positions: new Float32Array(pos),
    heights: new Float32Array(hgt),
    sizes: new Float32Array(sz),
    count: hgt.length,
  };
}

// ---------------------------------------------------------------------------
// City nodes — real demo-relevant coordinates, snapped to the nearest land dot
// ---------------------------------------------------------------------------

const CITIES: { lat: number; lon: number; label: string }[] = [
  { lat: 48.74, lon: 8.4, label: "Vaihingen" },
  { lat: 52.4, lon: 13.04, label: "Potsdam" },
  { lat: 40.71, lon: -74.01, label: "New York" },
  { lat: 51.51, lon: -0.13, label: "London" },
  { lat: 35.68, lon: 139.69, label: "Tokyo" },
  { lat: -33.87, lon: 151.21, label: "Sydney" },
  { lat: 1.35, lon: 103.82, label: "Singapore" },
  { lat: 19.43, lon: -99.13, label: "Mexico City" },
  { lat: 30.05, lon: 31.23, label: "Cairo" },
  { lat: 28.61, lon: 77.21, label: "Delhi" },
];

function latLonToDir(latDeg: number, lonDeg: number): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

/** Snap each city to the nearest generated land dot so pins never float at sea. */
function snapCitiesToLand(dots: DotData): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const stride = 3;
  for (const c of CITIES) {
    const dir = latLonToDir(c.lat, c.lon);
    let best = 0;
    let bestDot = -Infinity;
    for (let i = 0; i < dots.count; i++) {
      const d =
        dir.x * dots.positions[i * stride] +
        dir.y * dots.positions[i * stride + 1] +
        dir.z * dots.positions[i * stride + 2];
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    }
    out.push(
      new THREE.Vector3(
        dots.positions[best * stride],
        dots.positions[best * stride + 1],
        dots.positions[best * stride + 2]
      )
    );
  }
  return out;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build one geometry per arc, lifted above the sphere
function buildArcGeometry(a: THREE.Vector3, b: THREE.Vector3, segments: number, lift: number) {
  const points: THREE.Vector3[] = [];
  const omega = Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize()))));
  const sinOmega = Math.sin(omega) || 1e-6;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const ca = Math.sin((1 - t) * omega) / sinOmega;
    const cb = Math.sin(t * omega) / sinOmega;
    const p = a.clone().multiplyScalar(ca).add(b.clone().multiplyScalar(cb));
    p.normalize().multiplyScalar(RADIUS * 1.02 + Math.sin(t * Math.PI) * lift);
    points.push(p);
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

// ---------------------------------------------------------------------------
// Module-level shared interaction state (no React re-renders per pointer event)
// ---------------------------------------------------------------------------

const GLOBE_STATE = {
  dragging: false,
  pointerDown: false,
  reducedMotion: false,
  rot: { x: 0.22, y: -0.85 },
  vel: { x: 0, y: 0 },
  pending: { x: 0, y: 0 },
  scale: 1,
  targetScale: 1,
  worldPointerDir: new THREE.Vector3(),
  localPointerDir: new THREE.Vector3(0, 0, 1),
  pointerActive: 0, // smoothed 0..1
  lastInteraction: 0,
  last: null as { x: number; y: number } | null,
};

// ---------------------------------------------------------------------------
// Scene root
// ---------------------------------------------------------------------------

export function HeroScene() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  // Pause rendering when the tab is hidden or the hero scrolls out of view.
  useEffect(() => {
    let inView = true;
    let tabVisible = true;
    const apply = () => setFrameloop(inView && tabVisible ? "always" : "never");

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        apply();
      },
      { threshold: 0.02 }
    );
    if (wrapRef.current) io.observe(wrapRef.current);

    const onVis = () => {
      tabVisible = document.visibilityState === "visible";
      apply();
    };
    document.addEventListener("visibilitychange", onVis);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    GLOBE_STATE.reducedMotion = mq.matches;

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={wrapRef} className="h-full w-full" style={{ touchAction: "none" }}>
      <Canvas
        frameloop={frameloop}
        dpr={[0.75, 1.5]}
        camera={{ position: [0, 0.45, 5.4], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <GlobeRig>
            <Ocean />
            <LandDots />
            <ScanRing />
            <CityNodes />
            <Arcs />
            <Atmosphere />
            <OrbitRing />
          </GlobeRig>
          <StarShell />
          <PointerControls />
        </Suspense>
      </Canvas>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rig — rotation (drag + inertia + idle spin) and smoothed zoom
// ---------------------------------------------------------------------------

function GlobeRig({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const S = GLOBE_STATE;
    const clampedDt = Math.min(dt, 0.05);

    // Apply drag delta immediately
    if (S.pending.x !== 0 || S.pending.y !== 0) {
      S.rot.y += S.pending.y;
      S.rot.x += S.pending.x;
      S.vel.x = S.pending.x * 60;
      S.vel.y = S.pending.y * 60;
      S.pending.x = 0;
      S.pending.y = 0;
      S.lastInteraction = state.clock.elapsedTime;
    } else if (!S.dragging) {
      // Inertia
      S.rot.y += S.vel.y * clampedDt;
      S.rot.x += S.vel.x * clampedDt;
      S.rot.x = Math.max(-1.1, Math.min(1.1, S.rot.x));
      S.vel.x *= Math.pow(0.06, clampedDt);
      S.vel.y *= Math.pow(0.06, clampedDt);
      // Idle auto-rotation
      if (
        !S.reducedMotion &&
        Math.abs(S.vel.x) < 0.05 &&
        Math.abs(S.vel.y) < 0.05 &&
        state.clock.elapsedTime - S.lastInteraction > 1.6
      ) {
        S.rot.y += clampedDt * 0.055;
      }
    }

    // Smoothed zoom
    S.scale += (S.targetScale - S.scale) * Math.min(1, clampedDt * 7);

    g.rotation.set(S.rot.x, S.rot.y, 0);
    g.scale.setScalar(S.scale);

    // Transform the world-space pointer direction into globe-local space for
    // the dot shader's cursor spotlight.
    if (S.pointerActive > 0) {
      S.localPointerDir.copy(S.worldPointerDir);
      g.worldToLocal(S.localPointerDir);
      S.localPointerDir.normalize();
    }
    S.pointerActive += ((S.pointerDown || hoverActive ? 1 : 0) - S.pointerActive) * Math.min(1, clampedDt * 6);
  });

  return <group ref={groupRef}>{children}</group>;
}

let hoverActive = false;

// ---------------------------------------------------------------------------
// PointerControls — listeners on the canvas element (raycast-free)
// ---------------------------------------------------------------------------

function PointerControls() {
  const { gl, camera, size } = useThree();
  const raycaster = useMemo(() => {
    const rc = new THREE.Raycaster();
    return rc;
  }, []);
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(0, 0, 0), RADIUS * 1.02), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => {
    const el = gl.domElement;

    const updatePointerDir = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectSphere(sphere, hitPoint)) {
        GLOBE_STATE.worldPointerDir.copy(hitPoint).normalize();
        hoverActive = true;
      } else {
        hoverActive = false;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      GLOBE_STATE.dragging = true;
      GLOBE_STATE.pointerDown = true;
      GLOBE_STATE.last = { x: e.clientX, y: e.clientY };
      GLOBE_STATE.vel.x = 0;
      GLOBE_STATE.vel.y = 0;
      el.style.cursor = "grabbing";
      el.setPointerCapture?.(e.pointerId);
      updatePointerDir(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointerDir(e.clientX, e.clientY);
      if (GLOBE_STATE.dragging && GLOBE_STATE.last) {
        const dx = e.clientX - GLOBE_STATE.last.x;
        const dy = e.clientY - GLOBE_STATE.last.y;
        // Sensitivity scales inversely with zoom so drag feels 1:1 at all scales
        const k = 0.0042 / GLOBE_STATE.scale;
        GLOBE_STATE.pending.x = dy * k;
        GLOBE_STATE.pending.y = dx * k;
        GLOBE_STATE.last = { x: e.clientX, y: e.clientY };
      }
    };

    const endDrag = (e: PointerEvent) => {
      GLOBE_STATE.dragging = false;
      GLOBE_STATE.pointerDown = false;
      GLOBE_STATE.last = null;
      el.style.cursor = hoverActive ? "grab" : "";
      el.releasePointerCapture?.(e.pointerId);
    };

    const onPointerLeave = () => {
      hoverActive = false;
      if (!GLOBE_STATE.dragging) el.style.cursor = "";
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // zoom instead of page-scroll while over the globe
      GLOBE_STATE.targetScale = Math.max(
        0.75,
        Math.min(1.55, GLOBE_STATE.targetScale * (1 - e.deltaY * 0.0009))
      );
      GLOBE_STATE.lastInteraction = performance.now() / 1000;
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.style.cursor = "grab";

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("wheel", onWheel);
      el.style.cursor = "";
    };
  }, [gl, camera, raycaster, sphere, hitPoint, ndc, size]);

  return null;
}

// ---------------------------------------------------------------------------
// Ocean sphere — deep glass base under the dots
// ---------------------------------------------------------------------------

const oceanVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const oceanFragment = /* glsl */ `
  uniform vec3 uLightDir;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.4);

    vec3 deep = vec3(0.012, 0.024, 0.05);
    vec3 shallow = vec3(0.03, 0.10, 0.18);
    float latGrad = smoothstep(-1.0, 1.0, vNormal.y);
    vec3 col = mix(deep, shallow, latGrad * 0.7);

    // Cyan rim
    col += vec3(0.10, 0.42, 0.55) * fresnel * 0.55;

    // Soft day-side sheen
    float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
    col += vec3(0.05, 0.12, 0.16) * diff * 0.35;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function Ocean() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const lightDir = useMemo(() => new THREE.Vector3(0.55, 0.35, 0.75).normalize(), []);
  useFrame(() => {
    if (mat.current) mat.current.uniforms.uLightDir.value = lightDir;
  });
  return (
    <mesh raycast={() => null}>
      <sphereGeometry args={[RADIUS * 0.995, 64, 64]} />
      <shaderMaterial
        ref={mat}
        vertexShader={oceanVertex}
        fragmentShader={oceanFragment}
        uniforms={{ uLightDir: { value: lightDir } }}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Land dots — the DSM metaphor
// ---------------------------------------------------------------------------

const LAND = generateLandDots();
const CITY_POSITIONS = snapCitiesToLand(LAND);

const dotsVertex = /* glsl */ `
  attribute float aHeight;
  attribute float aSize;
  uniform float uPx;
  uniform vec3 uPointerDir;
  uniform float uPointerActive;
  varying float vH;
  varying float vSpot;
  varying vec3 vPosN;
  void main() {
    vH = aHeight;
    vec3 n = normalize(position);
    vPosN = n;
    float spot = pow(max(dot(n, normalize(uPointerDir)), 0.0), 22.0) * uPointerActive;
    vSpot = spot;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sizeBoost = 1.0 + spot * 0.9;
    gl_PointSize = clamp(aSize * sizeBoost * uPx / (-mv.z * 58.0), 1.2, 9.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const dotsFragment = /* glsl */ `
  uniform vec3 uScanY;
  uniform float uTime;
  varying float vH;
  varying float vSpot;
  varying vec3 vPosN;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.12, d);

    // Height colormap: teal shorelines -> cyan midlands -> ice peaks
    vec3 low = vec3(0.05, 0.36, 0.46);
    vec3 mid = vec3(0.10, 0.62, 0.68);
    vec3 high = vec3(0.78, 0.96, 1.0);
    vec3 col = mix(low, mid, smoothstep(0.0, 0.45, vH));
    col = mix(col, high, smoothstep(0.45, 1.0, vH));

    // Gentle global breathing so the shell feels alive
    float breathe = 0.9 + 0.1 * sin(uTime * 0.7 + vH * 6.0);

    // Scan band highlight (uScanY.x = sin(latitude), uScanY.y = band strength)
    float band = exp(-pow((vPosN.y - uScanY.x) * 5.5, 2.0)) * uScanY.y;
    col = mix(col, vec3(0.65, 1.0, 1.0), band * 0.85);

    // Cursor spotlight
    col += vec3(0.55, 0.95, 1.0) * vSpot * 1.1;

    gl_FragColor = vec4(col * breathe, alpha * (0.72 + band * 0.28 + vSpot * 0.3));
  }
`;

function LandDots() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size, viewport } = useThree();

  const uniforms = useMemo(
    () => ({
      uPx: { value: 800 },
      uPointerDir: { value: GLOBE_STATE.localPointerDir },
      uPointerActive: { value: 0 },
      uScanY: { value: new THREE.Vector2(0.3, 1) },
      uTime: { value: 0 },
    }),
    []
  );

  useFrame((state) => {
    const m = matRef.current;
    if (!m) return;
    const S = GLOBE_STATE;
    const t = state.clock.getElapsedTime();
    m.uniforms.uPx.value = size.height * viewport.dpr;
    m.uniforms.uTime.value = t;
    m.uniforms.uPointerActive.value = S.pointerActive;
    // Scan sweep: latitude wave wrapping -1..1
    const scan = S.reducedMotion ? 0.15 : Math.sin(t * 0.14) * 0.92;
    m.uniforms.uScanY.value.set(scan, 1);
  });

  return (
    <points raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[LAND.positions, 3]} />
        <bufferAttribute attach="attributes-aHeight" args={[LAND.heights, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[LAND.sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={dotsVertex}
        fragmentShader={dotsFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Scan ring — a glowing latitude circle following the shader's scan band
// ---------------------------------------------------------------------------

function ScanRing() {
  const objRef = useRef<THREE.Line>(null);

  const lineObj = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const r = RADIUS * 1.045;
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: "#22D3EE",
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);
    line.raycast = () => null;
    return line;
  }, []);

  useFrame((state) => {
    const m = objRef.current;
    if (!m) return;
    const t = state.clock.getElapsedTime();
    const latSin = GLOBE_STATE.reducedMotion ? 0.15 : Math.sin(t * 0.14) * 0.92;
    const lat = Math.asin(Math.max(-0.99, Math.min(0.99, latSin)));
    m.position.y = Math.sin(lat) * RADIUS;
    const ringR = Math.cos(lat) * RADIUS * 1.045;
    m.scale.setScalar(ringR / (RADIUS * 1.045));
    const mat = m.material as THREE.LineBasicMaterial;
    const edge = 1 - Math.pow(Math.abs(latSin), 6);
    mat.opacity = 0.10 + edge * 0.14;
  });

  return <primitive ref={objRef} object={lineObj} />;
}

// ---------------------------------------------------------------------------
// City nodes + comet arcs
// ---------------------------------------------------------------------------

function CityNodes() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.getElapsedTime();
    g.children.forEach((child, i) => {
      const core = child.children[0] as THREE.Mesh | undefined;
      const halo = child.children[1] as THREE.Mesh | undefined;
      const pulse = 0.75 + 0.25 * Math.sin(t * 1.6 + i * 0.9);
      if (core) (core.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.45 * pulse;
      if (halo) {
        const s = 0.8 + 0.35 * Math.sin(t * 1.6 + i * 0.9);
        halo.scale.setScalar(s);
        (halo.material as THREE.MeshBasicMaterial).opacity = 0.28 * pulse;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {CITY_POSITIONS.map((p, i) => (
        <group key={i} position={p}>
          <mesh raycast={() => null}>
            <sphereGeometry args={[0.028, 12, 12]} />
            <meshBasicMaterial color="#A5F3FC" transparent opacity={0.9} depthWrite={false} />
          </mesh>
          <mesh raycast={() => null} onUpdate={(m) => m.lookAt(0, 0, 0)}>
            <ringGeometry args={[0.05, 0.075, 24]} />
            <meshBasicMaterial
              color="#22D3EE"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const ARC_SEGMENTS = 48;

const ARCS: { geom: THREE.BufferGeometry; speed: number; phase: number }[] = (() => {
  const rng = mulberry32(4242);
  const arcs: { geom: THREE.BufferGeometry; speed: number; phase: number }[] = [];
  const n = CITY_POSITIONS.length;
  for (let i = 0; i < 9; i++) {
    let ai = Math.floor(rng() * n);
    let bi = Math.floor(rng() * n);
    if (bi === ai) bi = (ai + 1) % n;
    arcs.push({
      geom: buildArcGeometry(CITY_POSITIONS[ai], CITY_POSITIONS[bi], ARC_SEGMENTS, 0.35 + rng() * 0.45),
      speed: 0.10 + rng() * 0.14,
      phase: rng(),
    });
  }
  return arcs;
})();

function Arcs() {
  const comets = useRef<(THREE.Line | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    for (let i = 0; i < comets.current.length; i++) {
      const line = comets.current[i];
      if (!line) continue;
      const a = ARCS[i];
      const p = (t * a.speed + a.phase) % 1;
      const window = Math.floor(ARC_SEGMENTS * 0.22);
      const head = Math.floor(p * ARC_SEGMENTS);
      line.geometry.setDrawRange(Math.max(0, head - window), Math.min(head, window) || 1);
    }
  });

  return (
    <group>
      {ARCS.map((a, i) => {
        const trail = new THREE.Line(
          a.geom,
          new THREE.LineBasicMaterial({
            color: "#22D3EE",
            transparent: true,
            opacity: 0.07,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        );
        trail.raycast = () => null;
        const comet = new THREE.Line(
          a.geom,
          new THREE.LineBasicMaterial({
            color: "#99F6E4",
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        );
        comet.raycast = () => null;
        return (
          <group key={i}>
            <primitive object={trail} />
            <primitive
              ref={(el: THREE.Line | null) => {
                comets.current[i] = el;
              }}
              object={comet}
            />
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Atmosphere halo
// ---------------------------------------------------------------------------

function Atmosphere() {
  return (
    <mesh scale={1.17} raycast={() => null}>
      <sphereGeometry args={[RADIUS, 48, 48]} />
      <shaderMaterial
        vertexShader={`
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            vec3 col = vec3(0.16, 0.62, 0.95);
            gl_FragColor = vec4(col * intensity, intensity);
          }
        `}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Satellite on a tilted orbit ring
// ---------------------------------------------------------------------------

function OrbitRing() {
  const satRef = useRef<THREE.Mesh>(null);
  const RING_R = 2.35;

  useFrame((state) => {
    if (!satRef.current) return;
    const t = state.clock.getElapsedTime();
    const a = t * 0.22;
    satRef.current.position.set(Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R);
  });

  return (
    <group rotation={[0.42, 0, 0.18]}>
      <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RING_R, 0.004, 8, 128]} />
        <meshBasicMaterial color="#22D3EE" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh ref={satRef} raycast={() => null}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color="#FCD34D" transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Star shell
// ---------------------------------------------------------------------------

function StarShell() {
  const ref = useRef<THREE.Points>(null);
  const { positions, sizes, phases } = useMemo(() => {
    const COUNT = 900;
    const pos = new Float32Array(COUNT * 3);
    const sz = new Float32Array(COUNT);
    const ph = new Float32Array(COUNT);
    const rng = mulberry32(1337);
    for (let i = 0; i < COUNT; i++) {
      const r = 11 + rng() * 16;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.5 + rng() * 1.6;
      ph[i] = rng() * Math.PI * 2;
    }
    return { positions: pos, sizes: sz, phases: ph };
  }, []);

  const matRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (ref.current && !GLOBE_STATE.reducedMotion) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.008;
    }
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
  });

  return (
    <points ref={ref} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={`
          attribute float size;
          attribute float aPhase;
          uniform float uTime;
          varying float vTw;
          void main() {
            vTw = 0.65 + 0.35 * sin(uTime * 1.2 + aPhase);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = size * (150.0 / -mv.z);
          }
        `}
        fragmentShader={`
          varying float vTw;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(0.72, 0.88, 1.0, a * 0.5 * vTw);
          }
        `}
        uniforms={{ uTime: { value: 0 } }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
