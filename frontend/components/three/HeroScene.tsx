"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, Suspense } from "react";
import * as THREE from "three";

/**
 * Interactive 3D globe for the landing-page hero.
 *
 * Composition (back → front):
 *   1. Star shell (additive points, slow parallax)
 *   2. The globe — procedural shader (continents + atmosphere + rim glow)
 *   3. Latitude / longitude wireframe lines (cyan, low opacity)
 *   4. City pins (precomputed real-world coordinates)
 *   5. Animated flight-arcs connecting pin pairs
 *   6. Atmospheric halo
 *
 * Interaction (drag to orbit, auto-rotate when idle, wheel zoom).
 *
 * Notes on performance: we use precomputed pin coordinates (no JS-side noise
 * function in the render path) and rely on R3F's native pointer events instead
 * of an effect-attached listener — both keep the main thread free.
 */

// ---------------------------------------------------------------------------
// Pre-computed city coordinates (lon, lat in degrees) → unit-sphere Vector3.
// Hardcoded to avoid any JS-side fbm cost in the render path.
// ---------------------------------------------------------------------------

const PIN_DATA: { lat: number; lon: number; label: string }[] = [
  { lat: 48.74, lon: 8.4, label: "Vaihingen" },     // ISPRS Vaihingen
  { lat: 52.40, lon: 13.04, label: "Potsdam" },      // ISPRS Potsdam
  { lat: 40.71, lon: -74.01, label: "New York" },
  { lat: 51.51, lon: -0.13, label: "London" },
  { lat: 35.68, lon: 139.69, label: "Tokyo" },
  { lat: -33.87, lon: 151.21, label: "Sydney" },
  { lat: 19.43, lon: -99.13, label: "Mexico City" },
  { lat: 1.35, lon: 103.82, label: "Singapore" },
  { lat: 55.75, lon: 37.62, label: "Moscow" },
  { lat: -23.55, lon: -46.63, label: "São Paulo" },
  { lat: 30.05, lon: 31.23, label: "Cairo" },
  { lat: 28.61, lon: 77.21, label: "Delhi" },
  { lat: -1.29, lon: 36.82, label: "Nairobi" },
  { lat: 37.57, lon: 126.98, label: "Seoul" },
];

const RADIUS = 1.6;

function lonLatToVec3(latDeg: number, lonDeg: number, r = RADIUS): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Deterministic PRNG for picking arc pairs
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Canvas + scene composition
// ---------------------------------------------------------------------------

export function HeroScene() {
  return (
    <Canvas
      dpr={[0.6, 1.5]}
      camera={{ position: [0, 0.4, 5.2], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <Suspense fallback={null}>
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 3, 5]} intensity={1.0} color="#67E8F9" />
        <directionalLight position={[-5, -2, 2]} intensity={0.45} color="#F59E0B" />

        <GlobeRig>
          <Globe />
          <Graticule />
          <CityPins />
          <Arcs />
          <Atmosphere />
        </GlobeRig>

        <StarShell />
      </Suspense>
    </Canvas>
  );
}

// ---------------------------------------------------------------------------
// Globe rig — drag-to-orbit + idle auto-rotation + wheel zoom.
// Uses R3F native pointer events so we don't risk stale-closure bugs from
// effect-attached listeners, and stays inside the R3F render loop.
// ---------------------------------------------------------------------------

function GlobeRig({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const draggingRef = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const velocity = useRef({ x: 0, y: 0 });
  const rot = useRef({ x: 0.15, y: -0.6 });

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    if (!draggingRef.current) {
      rot.current.y += velocity.current.y * 0.92;
      rot.current.x += velocity.current.x * 0.92;
      rot.current.x = Math.max(-1.2, Math.min(1.2, rot.current.x));
      velocity.current.x *= 0.94;
      velocity.current.y *= 0.94;
      if (Math.abs(velocity.current.y) < 0.0005) {
        rot.current.y += dt * 0.06;
      }
    }
    g.rotation.y = rot.current.y;
    g.rotation.x = rot.current.x;
  });

  return (
    <group
      ref={groupRef}
      onPointerOver={() => {
        if (typeof document !== "undefined") document.body.style.cursor = "grab";
      }}
      onPointerOut={() => {
        draggingRef.current = false;
        lastPointer.current = null;
        if (typeof document !== "undefined") document.body.style.cursor = "";
      }}
      onPointerDown={(e) => {
        draggingRef.current = true;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        velocity.current = { x: 0, y: 0 };
        if (typeof document !== "undefined") document.body.style.cursor = "grabbing";
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current || !lastPointer.current) return;
        const dx = e.clientX - lastPointer.current.x;
        const dy = e.clientY - lastPointer.current.y;
        rot.current.y += dx * 0.005;
        rot.current.x += dy * 0.005;
        rot.current.x = Math.max(-1.2, Math.min(1.2, rot.current.x));
        velocity.current = { x: dy * 0.005, y: dx * 0.005 };
        lastPointer.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        lastPointer.current = null;
        if (typeof document !== "undefined") document.body.style.cursor = "";
        (e.target as Element).releasePointerCapture?.(e.pointerId);
      }}
      onWheel={(e) => {
        const g = groupRef.current;
        if (!g) return;
        const s = g.scale.x;
        const next = Math.max(0.7, Math.min(1.6, s * (1 + e.deltaY * 0.0006)));
        g.scale.setScalar(next);
      }}
    >
      {children}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Star shell
// ---------------------------------------------------------------------------

function StarShell() {
  const ref = useRef<THREE.Points>(null);
  const { positions, sizes } = useMemo(() => {
    const COUNT = 1200;
    const pos = new Float32Array(COUNT * 3);
    const sz = new Float32Array(COUNT);
    const rng = mulberry32(1337);
    for (let i = 0; i < COUNT; i++) {
      const r = 12 + rng() * 18;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.5 + rng() * 1.8;
    }
    return { positions: pos, sizes: sz };
  }, []);

  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.getElapsedTime() * 0.01;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={`
          attribute float size;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = size * (180.0 / -mv.z);
          }
        `}
        fragmentShader={`
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(0.7, 0.9, 1.0, a * 0.6);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// The globe
// ---------------------------------------------------------------------------

const globeVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const globeFragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 p = vPos * 1.0;
    float continent = fbm(p * 1.1 + vec3(uTime * 0.01, 0.0, 0.0));
    float detail = fbm(p * 3.6);
    float landMask = smoothstep(0.50, 0.62, continent);

    float lat = abs(vNormal.y);
    float polar = smoothstep(0.65, 0.98, lat);

    vec3 oceanDeep = vec3(0.012, 0.04, 0.10);
    vec3 oceanShallow = vec3(0.04, 0.20, 0.34);
    vec3 ocean = mix(oceanDeep, oceanShallow, smoothstep(0.0, 1.0, detail));

    vec3 forest = vec3(0.05, 0.22, 0.13);
    vec3 arid = vec3(0.32, 0.22, 0.10);
    float climate = fbm(p * 0.5 + vec3(11.0, 3.0, 7.0));
    vec3 land = mix(forest, arid, smoothstep(0.35, 0.65, climate));

    float ridge = smoothstep(0.55, 0.85, fbm(p * 4.5));
    land = mix(land, vec3(0.95, 0.97, 1.0), ridge * smoothstep(0.6, 0.95, lat));

    vec3 surface = mix(ocean, land, landMask);
    surface = mix(surface, vec3(0.88, 0.94, 1.0), polar);

    vec3 lightDir = normalize(vec3(0.6, 0.4, 0.7));
    float nightFactor = max(0.0, -dot(normalize(vNormal), lightDir));
    float cityMask = smoothstep(0.52, 0.62, continent) * smoothstep(0.45, 0.7, detail);
    float cityNoise = fbm(p * 14.0 + vec3(0.0, uTime * 0.04, 0.0));
    float cityDots = smoothstep(0.78, 0.82, cityNoise) * cityMask;
    vec3 cityGlow = vec3(1.0, 0.78, 0.35) * cityDots * nightFactor * 1.4;

    vec3 color = surface + cityGlow;
    color = pow(color, vec3(0.92));
    gl_FragColor = vec4(color, 1.0);
  }
`;

function Globe() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[RADIUS, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={globeVertex}
        fragmentShader={globeFragment}
        uniforms={{ uTime: { value: 0 } }}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Graticule (lat/long wires) — built once at module scope, not per-frame
// ---------------------------------------------------------------------------

const GRATICULE_LINES: { points: THREE.Vector3[]; op: number }[] = (() => {
  const R = RADIUS + 0.02;
  const arr: { points: THREE.Vector3[]; op: number }[] = [];
  for (let i = 1; i < 6; i++) {
    const phi = (i / 6) * Math.PI;
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= 96; j++) {
      const theta = (j / 96) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          R * Math.sin(phi) * Math.cos(theta),
          R * Math.cos(phi),
          R * Math.sin(phi) * Math.sin(theta)
        )
      );
    }
    arr.push({ points, op: 0.15 });
  }
  for (let i = 0; i < 8; i++) {
    const theta = (i / 8) * Math.PI * 2;
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= 64; j++) {
      const phi = (j / 64) * Math.PI;
      points.push(
        new THREE.Vector3(
          R * Math.sin(phi) * Math.cos(theta),
          R * Math.cos(phi),
          R * Math.sin(phi) * Math.sin(theta)
        )
      );
    }
    arr.push({ points, op: 0.1 });
  }
  return arr;
})();

function Graticule() {
  return (
    <group>
      {GRATICULE_LINES.map((l, i) => (
        <primitive
          key={i}
          object={
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(l.points),
              new THREE.LineBasicMaterial({
                color: "#22D3EE",
                transparent: true,
                opacity: l.op,
                depthWrite: false,
              })
            )
          }
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// City pins — precomputed positions
// ---------------------------------------------------------------------------

const PIN_POSITIONS: THREE.Vector3[] = PIN_DATA.map((p) => lonLatToVec3(p.lat, p.lon));

function CityPins() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.getElapsedTime();
    g.children.forEach((child, i) => {
      const inner = child.children[1] as THREE.Mesh | undefined;
      if (!inner) return;
      const mat = inner.material as THREE.MeshBasicMaterial | undefined;
      if (mat) mat.opacity = 0.6 + 0.4 * Math.sin(t * 1.5 + i * 0.7);
    });
  });

  return (
    <group ref={groupRef}>
      {PIN_POSITIONS.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <ringGeometry args={[0.03, 0.06, 24]} />
            <meshBasicMaterial
              color="#22D3EE"
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.025, 16, 16]} />
            <meshBasicMaterial color="#67E8F9" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Animated arcs — precomputed at module scope
// ---------------------------------------------------------------------------

const ARC_COUNT = 22;

const ARC_DATA: { geom: THREE.BufferGeometry; phase: number; speed: number }[] = (() => {
  const rng = mulberry32(99);
  const arcs: { geom: THREE.BufferGeometry; phase: number; speed: number }[] = [];
  for (let i = 0; i < ARC_COUNT; i++) {
    let ai = Math.floor(rng() * PIN_POSITIONS.length);
    let bi = Math.floor(rng() * PIN_POSITIONS.length);
    if (bi === ai) bi = (ai + 1) % PIN_POSITIONS.length;
    const a = PIN_POSITIONS[ai];
    const b = PIN_POSITIONS[bi];
    arcs.push({
      geom: buildArc(a, b, 32, 0.5 + rng() * 0.5),
      phase: rng(),
      speed: 0.3 + rng() * 0.6,
    });
  }
  return arcs;
})();

function Arcs() {
  const refs = useRef<(THREE.Line | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    for (let i = 0; i < refs.current.length; i++) {
      const line = refs.current[i];
      if (!line) continue;
      const mat = line.material as THREE.LineBasicMaterial;
      const phase = (t * ARC_DATA[i].speed + ARC_DATA[i].phase) % 1;
      mat.opacity = 0.2 + 0.7 * Math.exp(-Math.pow((phase - 0.5) * 4, 2));
    }
  });

  return (
    <group>
      {ARC_DATA.map((l, i) => (
        <primitive
          key={i}
          ref={(el: THREE.Line | null) => { refs.current[i] = el; }}
          object={
            new THREE.Line(
              l.geom,
              new THREE.LineBasicMaterial({
                color: "#22D3EE",
                transparent: true,
                opacity: 0.3,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
              })
            )
          }
        />
      ))}
    </group>
  );
}

// Build an arc between two points on the sphere surface, lifting it up
function buildArc(a: THREE.Vector3, b: THREE.Vector3, segments: number, height: number) {
  const points: THREE.Vector3[] = [];
  const aLen = a.length();
  const bLen = b.length();
  const dot = a.dot(b) / (aLen * bLen);
  const omega = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sinOmega = Math.sin(omega) || 1e-6;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const ca = Math.sin((1 - t) * omega) / sinOmega;
    const cb = Math.sin(t * omega) / sinOmega;
    const p = a.clone().multiplyScalar(ca).add(b.clone().multiplyScalar(cb));
    const lift = Math.sin(t * Math.PI) * height;
    p.normalize().multiplyScalar(aLen + lift);
    points.push(p);
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

// ---------------------------------------------------------------------------
// Atmospheric halo
// ---------------------------------------------------------------------------

function Atmosphere() {
  return (
    <mesh scale={1.08}>
      <sphereGeometry args={[RADIUS, 64, 64]} />
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
            float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1)), 2.5);
            vec3 col = vec3(0.13, 0.6, 0.95);
            gl_FragColor = vec4(col * intensity, 1.0);
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