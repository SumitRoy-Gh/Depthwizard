"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const POINTS = 240;

export function HeroScene() {
  return (
    <Canvas
      dpr={[0.6, 1.25]}
      camera={{ position: [0, 0, 8], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 3, 3]} intensity={1.2} color="#67E8F9" />
      <directionalLight position={[-3, -2, 1]} intensity={0.5} color="#F59E0B" />

      <HeightCloud />
      <DataStreams />
    </Canvas>
  );
}

function HeightCloud() {
  const ref = useRef<THREE.Points>(null);

  const [positions, colors, sizes] = useMemo(() => {
    const pos = new Float32Array(POINTS * 3);
    const col = new Float32Array(POINTS * 3);
    const sz = new Float32Array(POINTS);

    // Viridis-inspired palette
    const palette = [
      [0.267, 0.005, 0.329],
      [0.282, 0.140, 0.457],
      [0.254, 0.265, 0.530],
      [0.207, 0.372, 0.553],
      [0.164, 0.471, 0.558],
      [0.128, 0.567, 0.551],
      [0.135, 0.659, 0.518],
      [0.267, 0.749, 0.441],
      [0.478, 0.821, 0.318],
      [0.741, 0.873, 0.150],
      [0.993, 0.906, 0.144],
    ];

    for (let i = 0; i < POINTS; i++) {
      // Spherical-ish cloud
      const r = 2.5 + Math.random() * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const idx = Math.floor(Math.random() * palette.length);
      col[i * 3 + 0] = palette[idx][0];
      col[i * 3 + 1] = palette[idx][1];
      col[i * 3 + 2] = palette[idx][2];

      sz[i] = 1 + Math.random() * 2.5;
    }
    return [pos, col, sz];
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ref.current) {
      ref.current.rotation.y = t * 0.1;
      ref.current.rotation.x = Math.sin(t * 0.2) * 0.15;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={`
          attribute float size;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = size * (180.0 / -mvPosition.z);
          }
        `}
        fragmentShader={`
          varying vec3 vColor;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c);
            if (d > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vColor, alpha * 0.9);
          }
        `}
        transparent
        depthWrite={false}
        vertexColors
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function DataStreams() {
  const linesRef = useRef<THREE.Group>(null);

  const lines = useMemo(() => {
    const arr: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
    for (let i = 0; i < 30; i++) {
      const a = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4
      );
      const b = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4
      );
      arr.push({ from: a, to: b });
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (linesRef.current) {
      linesRef.current.children.forEach((child, i) => {
        const mat = (child as any).material as THREE.LineBasicMaterial;
        if (mat) {
          mat.opacity = 0.15 + Math.abs(Math.sin(t * 0.5 + i * 0.3)) * 0.35;
        }
      });
    }
  });

  return (
    <group ref={linesRef}>
      {lines.map((l, i) => {
        const geom = new THREE.BufferGeometry().setFromPoints([l.from, l.to]);
        return (
          <primitive key={i} object={new THREE.Line(geom, new THREE.LineBasicMaterial({ color: "#22D3EE", transparent: true, opacity: 0.2 }))} />
        );
      })}
    </group>
  );
}