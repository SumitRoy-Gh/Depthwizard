"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, ShaderMaterial } from "three";

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  // 3D simplex-ish hash for procedural surface
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
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Procedural landmass — continents carved out of water
    vec3 p = vPosition * 0.85;
    float continent = fbm(p * 0.7 + vec3(uTime * 0.02, 0.0, 0.0));
    float detail = fbm(p * 3.5);

    float landMask = smoothstep(0.48, 0.62, continent);

    // Latitudinal shading (poles cooler)
    float lat = abs(vNormal.y);
    float polar = smoothstep(0.55, 0.95, lat);

    // Ocean — deep cyan to bright surface
    vec3 oceanDeep = vec3(0.015, 0.04, 0.10);
    vec3 oceanShallow = vec3(0.03, 0.18, 0.32);
    vec3 ocean = mix(oceanDeep, oceanShallow, smoothstep(0.0, 1.0, detail));

    // Land — from forest green to arid amber
    vec3 forest = vec3(0.04, 0.18, 0.10);
    vec3 arid = vec3(0.28, 0.20, 0.10);
    float climate = fbm(p * 0.4 + vec3(13.0, 0.0, 7.0));
    vec3 land = mix(forest, arid, smoothstep(0.35, 0.65, climate));

    // Mountain ridges
    float ridge = smoothstep(0.55, 0.85, fbm(p * 4.0 + 1.0));
    vec3 snow = vec3(0.92, 0.96, 1.0);
    land = mix(land, snow, ridge * smoothstep(0.6, 0.95, lat * 1.2));

    vec3 surface = mix(ocean, land, landMask);

    // Polar caps
    vec3 ice = vec3(0.88, 0.94, 1.0);
    surface = mix(surface, ice, polar);

    // Atmospheric rim
    vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(vPosition, 1.0)).xyz);
    float rim = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.5);
    vec3 atmos = vec3(0.13, 0.55, 0.85) * rim * 0.9;

    // Subtle city lights on dark side
    float nightFactor = max(0.0, -dot(normalize(vNormal), normalize(uLightDir)));
    float cityMask = smoothstep(0.55, 0.62, continent) * smoothstep(0.4, 0.65, detail);
    float cityNoise = fbm(p * 12.0 + vec3(0.0, uTime * 0.05, 0.0));
    float cityDots = smoothstep(0.78, 0.82, cityNoise) * cityMask;
    vec3 cityGlow = vec3(1.0, 0.78, 0.35) * cityDots * nightFactor * 1.4;

    vec3 color = surface + atmos + cityGlow;

    // Cinematic tone — slight contrast bump
    color = pow(color, vec3(0.92));

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function Earth() {
  const meshRef = useRef<Mesh>(null);
  const matRef = useRef<ShaderMaterial>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.04;
    }
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = t;
    }
  });

  const lightDir: [number, number, number] = [1, 0.3, 0.6];

  return (
    <group>
      {/* The Earth */}
      <mesh ref={meshRef} position={[1.6, 0.3, -1.2]}>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={{
            uTime: { value: 0 },
            uLightDir: { value: lightDir },
          }}
        />
      </mesh>

      {/* Cloud layer */}
      <Clouds />

      {/* Atmosphere halo */}
      <mesh position={[1.6, 0.3, -1.2]} scale={1.06}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={atmosphereVertex}
          fragmentShader={atmosphereFragment}
          uniforms={{ uColor: { value: [0.3, 0.65, 1.0] } }}
          transparent
          side={2}
          depthWrite={false}
          blending={2}
        />
      </mesh>
    </group>
  );
}

function Clouds() {
  const meshRef = useRef<Mesh>(null);
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.055;
    }
  });
  return (
    <mesh ref={meshRef} position={[1.6, 0.3, -1.2]} scale={1.012}>
      <sphereGeometry args={[1, 48, 48]} />
      <shaderMaterial
        vertexShader={cloudVertex}
        fragmentShader={cloudFragment}
        uniforms={{ uTime: { value: 0 } }}
        transparent
        depthWrite={false}
        opacity={0.5}
      />
    </mesh>
  );
}

const cloudVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
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
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }
  void main() {
    float clouds = fbm(vPosition * 3.0 + vec3(uTime * 0.03, 0.0, uTime * 0.015));
    float c = smoothstep(0.45, 0.85, clouds);
    gl_FragColor = vec4(1.0, 1.0, 1.0, c * 0.4);
  }
`;

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  uniform vec3 uColor;
  void main() {
    float intensity = pow(0.7 - dot(vNormal, vec3(0,0,1)), 2.0);
    gl_FragColor = vec4(uColor, 1.0) * intensity;
  }
`;