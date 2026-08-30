"use client";

import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = 1800;

export function ParticleField() {
  const ref = useRef<THREE.Points>(null);
  const { mouse } = useThree();

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      // Spherical shell distribution
      const r = 4 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      size[i] = Math.random() * 1.5 + 0.3;
    }
    return [pos, size];
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ref.current) {
      ref.current.rotation.y = t * 0.015;
      ref.current.rotation.x = mouse.y * 0.05;
    }
  });

  const vertexShader = /* glsl */ `
    attribute float size;
    varying float vSize;
    uniform float uTime;
    void main() {
      vSize = size;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = size * (220.0 / -mvPosition.z);
    }
  `;

  const fragmentShader = /* glsl */ `
    varying float vSize;
    void main() {
      vec2 c = gl_PointCoord - vec2(0.5);
      float d = length(c);
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, d);
      // Color variation — mostly cyan, some amber, some white
      vec3 color = vec3(0.55, 0.9, 1.0);
      gl_FragColor = vec4(color, alpha * 0.85);
    }
  `;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}