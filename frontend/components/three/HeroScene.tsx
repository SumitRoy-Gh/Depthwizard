"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect, Suspense } from "react";
import * as THREE from "three";

/**
 * Interactive 3D globe for the landing-page hero.
 *
 * Composition (back → front):
 *   1. Star shell (additive points, slow parallax)
 *   2. The globe — procedural shader (continents + atmosphere + rim glow)
 *   3. Latitude / longitude wireframe lines (cyan, low opacity)
 *   4. ~14 city pins that pulse softly
 *   5. ~22 animated flight-arcs connecting random pin pairs
 *   6. Atmospheric halo
 *
 * Interaction:
 *   - Drag to orbit (custom inertia — no drei OrbitControls to keep bundle small)
 *   - Auto-rotate when idle
 *   - Wheel zoom (clamped)
 *
 * Visual language matches the rest of the site: dark + cyan + amber + viridis.
 */

const PIN_COUNT = 14;
const ARC_COUNT = 22;

// Deterministic PRNG so the layout is stable across renders / page loads
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Land-ish distribution: sample points until enough land cells — uses the same
// fbm as the shader, evaluated in JS so pins tend to sit on landmasses.
function fbm(x: number, y: number, z: number) {
  function hash(ix: number, iy: number, iz: number) {
    let h = ix * 374761393 + iy * 668265263 + iz * 1274126177;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  function noise(x: number, y: number, z: number) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const w = fz * fz * (3 - 2 * fz);
    const n000 = hash(ix, iy, iz);
    const n100 = hash(ix + 1, iy, iz);
    const n010 = hash(ix, iy + 1, iz);
    const n110 = hash(ix + 1, iy + 1, iz);
    const n001 = hash(ix, iy, iz + 1);
    const n101 = hash(ix + 1, iy, iz + 1);
    const n011 = hash(ix, iy + 1, iz + 1);
    const n111 = hash(ix + 1, iy + 1, iz + 1);
    return (
      n000 * (1 - u) * (1 - v) * (1 - w) +
      n100 * u * (1 - v) * (1 - w) +
      n010 * (1 - u) * v * (1 - w) +
      n110 * u * v * (1 - w) +
      n001 * (1 - u) * (1 - v) * w +
      n101 * u * (1 - v) * w +
      n011 * (1 - u) * v * w +
      n111 * u * v * w
    );
  }
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * noise(x, y, z);
    x *= 2.02; y *= 2.02; z *= 2.02;
    a *= 0.5;
  }
  return v;
}

function isLand(p: THREE.Vector3, threshold = 0.52) {
  return fbm(p.x * 0.8 + 0.1, p.y * 0.8 + 0.1, p.z * 0.8 + 0.1) > threshold;
}

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

/**
 * The globe rig handles user orbit + auto-rotation. We use a custom controller
 * (no drei) so we don't pay the OrbitControls bundle for a hero element.
 */
function GlobeRig({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const [dragging, setDragging] = useState(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const velocity = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rot = useRef<{ x: number; y: number }>({ x: 0.15, y: -0.6 });
  const { gl } = useThree();

  useEffect(() => {
    const dom = gl.domElement;
    const onDown = (e: PointerEvent) => {
      setDragging(true);
      lastPointer.current = { x: e.clientX, y: e.clientY };
      velocity.current = { x: 0, y: 0 };
      dom.setPointerCapture(e.pointerId);
      dom.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || !lastPointer.current) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      rot.current.y += dx * 0.005;
      rot.current.x += dy * 0.005;
      rot.current.x = Math.max(-1.2, Math.min(1.2, rot.current.x));
      velocity.current = { x: dy * 0.005, y: dx * 0.005 };
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      setDragging(false);
      lastPointer.current = null;
      try { dom.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      dom.style.cursor = "grab";
    };
    const onWheel = (e: WheelEvent) => {
      // Custom zoom — adjust group scale, keep cheap
      if (!groupRef.current) return;
      const s = groupRef.current.scale.x;
      const next = Math.max(0.7, Math.min(1.6, s * (1 + e.deltaY * 0.0006)));
      groupRef.current.scale.setScalar(next);
    };
    dom.style.cursor = "grab";
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.style.cursor = "";
    };
  }, [dragging, gl]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    // Apply inertia when released
    if (!dragging) {
      rot.current.y += velocity.current.y * 0.92;
      rot.current.x += velocity.current.x * 0.92;
      rot.current.x = Math.max(-1.2, Math.min(1.2, rot.current.x));
      // Damp
      velocity.current.x *= 0.94;
      velocity.current.y *= 0.94;
      // Idle auto-rotate
      if (Math.abs(velocity.current.y) < 0.0005) {
        rot.current.y += dt * 0.06;
      }
    }
    groupRef.current.rotation.y = rot.current.y;
    groupRef.current.rotation.x = rot.current.x;
  });

  return <group ref={groupRef}>{children}</group>;
}

/* ---------- Star shell ---------- */
function StarShell() {
  const ref = useRef<THREE.Points>(null);
  const [positions, sizes] = useMemo(() => {
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
    return [pos, sz];
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

/* ---------- The globe ---------- */

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
    // Two scales of continents — broad shape + coast detail
    float continent = fbm(p * 1.1 + vec3(uTime * 0.01, 0.0, 0.0));
    float detail = fbm(p * 3.6);
    float landMask = smoothstep(0.50, 0.62, continent);

    // Polar shading
    float lat = abs(vNormal.y);
    float polar = smoothstep(0.65, 0.98, lat);

    // Ocean — deep blue with subtle gradient
    vec3 oceanDeep = vec3(0.012, 0.04, 0.10);
    vec3 oceanShallow = vec3(0.04, 0.20, 0.34);
    vec3 ocean = mix(oceanDeep, oceanShallow, smoothstep(0.0, 1.0, detail));

    // Land — mix of forest green and amber (matches site palette)
    vec3 forest = vec3(0.05, 0.22, 0.13);
    vec3 arid = vec3(0.32, 0.22, 0.10);
    float climate = fbm(p * 0.5 + vec3(11.0, 3.0, 7.0));
    vec3 land = mix(forest, arid, smoothstep(0.35, 0.65, climate));

    // Subtle mountain ridges
    float ridge = smoothstep(0.55, 0.85, fbm(p * 4.5));
    land = mix(land, vec3(0.95, 0.97, 1.0), ridge * smoothstep(0.6, 0.95, lat));

    vec3 surface = mix(ocean, land, landMask);
    surface = mix(surface, vec3(0.88, 0.94, 1.0), polar);

    // Night-side city lights
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
      <sphereGeometry args={[1.6, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={globeVertex}
        fragmentShader={globeFragment}
        uniforms={{ uTime: { value: 0 } }}
      />
    </mesh>
  );
}

/* ---------- Graticule (lat/long wires) ---------- */
function Graticule() {
  const lines = useMemo(() => {
    const arr: { points: THREE.Vector3[]; op: number }[] = [];
    const R = 1.62;
    // 6 latitudes
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
    // 8 longitudes
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
  }, []);

  return (
    <group>
      {lines.map((l, i) => {
        const geom = new THREE.BufferGeometry().setFromPoints(l.points);
        return (
          <primitive
            key={i}
            object={
              new THREE.Line(
                geom,
                new THREE.LineBasicMaterial({
                  color: "#22D3EE",
                  transparent: true,
                  opacity: l.op,
                  depthWrite: false,
                })
              )
            }
          />
        );
      })}
    </group>
  );
}

/* ---------- City pins ---------- */
function CityPins() {
  const pins = useMemo(() => {
    const arr: THREE.Vector3[] = [];
    const rng = mulberry32(42);
    let attempts = 0;
    while (arr.length < PIN_COUNT && attempts < 600) {
      attempts++;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const v = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(1.6);
      if (isLand(v.clone().normalize())) arr.push(v);
    }
    return arr;
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.children.forEach((child, i) => {
      // Pulse the inner sphere
      const inner = child.children[1] as THREE.Mesh;
      if (inner && (inner as any).material) {
        const mat = inner.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.6 + 0.4 * Math.sin(t * 1.5 + i * 0.7);
      }
    });
  });

  return (
    <group ref={groupRef}>
      {pins.map((p, i) => (
        <group key={i} position={p}>
          {/* Glow ring (flat disc tangent to surface) */}
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
          {/* Pulse core */}
          <mesh>
            <sphereGeometry args={[0.025, 16, 16]} />
            <meshBasicMaterial color="#67E8F9" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ---------- Animated arcs connecting pins ---------- */
function Arcs() {
  const pins = useMemo(() => {
    const arr: THREE.Vector3[] = [];
    const rng = mulberry32(42);
    let attempts = 0;
    while (arr.length < PIN_COUNT && attempts < 600) {
      attempts++;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const v = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(1.6);
      if (isLand(v.clone().normalize())) arr.push(v);
    }
    return arr;
  }, []);

  const arcLines = useMemo(() => {
    const rng = mulberry32(99);
    const lines: { geom: THREE.BufferGeometry; phase: number; speed: number }[] = [];
    for (let i = 0; i < ARC_COUNT; i++) {
      const a = pins[Math.floor(rng() * pins.length)];
      let b = a;
      while (b === a) {
        b = pins[Math.floor(rng() * pins.length)];
      }
      const arc = buildArc(a, b, 32, 1 + rng() * 0.5);
      lines.push({ geom: arc, phase: rng(), speed: 0.3 + rng() * 0.6 });
    }
    return lines;
  }, [pins]);

  const refs = useRef<(THREE.Line | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    refs.current.forEach((line, i) => {
      if (!line) return;
      const mat = line.material as THREE.LineBasicMaterial;
      const phase = (t * arcLines[i].speed + arcLines[i].phase) % 1;
      // Pulse: bright around phase 0.5, dim elsewhere
      mat.opacity = 0.2 + 0.7 * Math.exp(-Math.pow((phase - 0.5) * 4, 2));
    });
  });

  return (
    <group>
      {arcLines.map((l, i) => (
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

/* Build an arc between two points on the sphere surface, lifting it up */
function buildArc(a: THREE.Vector3, b: THREE.Vector3, segments: number, height: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Spherical interpolation
    const dot = a.dot(b) / (a.length() * b.length());
    const omega = Math.acos(Math.max(-1, Math.min(1, dot)));
    const sinOmega = Math.sin(omega) || 1e-6;
    const ca = Math.sin((1 - t) * omega) / sinOmega;
    const cb = Math.sin(t * omega) / sinOmega;
    const p = a.clone().multiplyScalar(ca).add(b.clone().multiplyScalar(cb));
    // Lift arc outward
    const lift = Math.sin(t * Math.PI) * height;
    p.normalize().multiplyScalar(a.length() + lift);
    points.push(p);
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

/* ---------- Atmospheric halo ---------- */
function Atmosphere() {
  return (
    <mesh scale={1.08}>
      <sphereGeometry args={[1.6, 64, 64]} />
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