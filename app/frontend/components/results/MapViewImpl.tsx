"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export function MapViewImpl() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // Use a free, no-key tile source. Carto's basemaps are CC-BY and don't require auth.
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
              "https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap, © CARTO",
          },
          "carto-dark-labels": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
              "https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
          },
        },
        layers: [
          { id: "base", type: "raster", source: "carto-dark" },
          { id: "labels", type: "raster", source: "carto-dark-labels" },
        ],
      },
      center: [8.4, 48.74], // Vaihingen an der Enz
      zoom: 14,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");

    // Add a glowing marker at Vaihingen
    const marker = document.createElement("div");
    marker.className = "depthwizard-marker";
    marker.innerHTML = `
      <style>
        .depthwizard-marker { position: relative; }
        .depthwizard-marker::before {
          content: ""; position: absolute; inset: -10px;
          border-radius: 999px; background: rgba(34,211,238,0.4);
          filter: blur(6px); animation: dw-pulse 1.6s ease-in-out infinite;
        }
        .depthwizard-marker::after {
          content: ""; position: relative; display: block;
          width: 14px; height: 14px; border-radius: 999px;
          background: #22D3EE; border: 2px solid #0B0E14;
          box-shadow: 0 0 12px rgba(34,211,238,0.8);
        }
        @keyframes dw-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.3); }
        }
      </style>
    `;
    new maplibregl.Marker(marker).setLngLat([8.4, 48.74]).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full overflow-hidden rounded-2xl" />;
}