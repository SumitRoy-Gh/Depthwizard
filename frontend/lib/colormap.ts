// Viridis and terrain colormap samplers using chroma-js.

import chroma from "chroma-js";

const viridis = chroma.scale("viridis").mode("lab").colors(256);
const terrain = chroma.scale([
  "#0a1f3a",
  "#1a3a5c",
  "#2d5a4a",
  "#6b8e4e",
  "#c2a850",
  "#8b5a2b",
  "#ffffff",
]).mode("lab").colors(256);

export function viridisColor(t: number): [number, number, number] {
  const i = Math.max(0, Math.min(255, Math.floor(t * 255)));
  const [r, g, b] = chroma(viridis[i]).rgb();
  return [r / 255, g / 255, b / 255];
}

export function terrainColor(t: number): [number, number, number] {
  const i = Math.max(0, Math.min(255, Math.floor(t * 255)));
  const [r, g, b] = chroma(terrain[i]).rgb();
  return [r / 255, g / 255, b / 255];
}

export function viridisHex(t: number): string {
  const i = Math.max(0, Math.min(255, Math.floor(t * 255)));
  return chroma(viridis[i]).hex();
}

export function terrainHex(t: number): string {
  const i = Math.max(0, Math.min(255, Math.floor(t * 255)));
  return chroma(terrain[i]).hex();
}

// Build a CSS gradient string for legend strips
export function colormapCss(map: "viridis" | "terrain"): string {
  const stops = (map === "viridis" ? viridis : terrain).slice(0, -1).filter((_: string, i: number) => i % 8 === 0);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}