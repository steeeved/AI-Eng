"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { EmbeddingData, WordPoint } from "./EmbeddingPlot";

// ─── 3-D math helpers ─────────────────────────────────────────────────────────

type Vec3 = [number, number, number];

/** Rotate a point around the X axis by angle θ */
function rotX(v: Vec3, t: number): Vec3 {
  const [x, y, z] = v;
  return [x, y * Math.cos(t) - z * Math.sin(t), y * Math.sin(t) + z * Math.cos(t)];
}

/** Rotate a point around the Y axis by angle θ */
function rotY(v: Vec3, t: number): Vec3 {
  const [x, y, z] = v;
  return [x * Math.cos(t) + z * Math.sin(t), y, -x * Math.sin(t) + z * Math.cos(t)];
}

/** Apply rotX then rotY to a world-space point */
function transform(v: Vec3, rx: number, ry: number): Vec3 {
  return rotY(rotX(v, rx), ry);
}

/**
 * Perspective-project a camera-space point onto the canvas.
 * fov controls the field of view (camera distance proxy).
 * Returns [screenX, screenY, depth] where depth is the camera-space z.
 */
function project(
  v: Vec3,
  cx: number,
  cy: number,
  fov: number,
  zoom: number
): [number, number, number] {
  const [x, y, z] = v;
  const d = fov + z; // distance from camera to point (camera at -fov)
  const scale = (fov * zoom) / Math.max(d, 0.1);
  return [cx + x * scale, cy - y * scale, z];
}

// ─── Hex → rgba helper ───────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  data: EmbeddingData;
  searchQuery: string;
  analogyHighlight: {
    words: string[];
    vector?: { ax: number; ay: number; bx: number; by: number; cx: number; cy: number; rx: number; ry: number };
  } | null;
  onWordClick: (word: WordPoint) => void;
  selectedWord: WordPoint | null;
}

// ─── EmbeddingPlot3D ─────────────────────────────────────────────────────────

export default function EmbeddingPlot3D({
  data,
  searchQuery,
  analogyHighlight,
  onWordClick,
  selectedWord,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state (persistent refs — no re-render on change)
  const rxRef = useRef(-0.28);   // pitch (tilt down slightly so depth is visible)
  const ryRef = useRef(0.4);    // yaw
  const zoomRef = useRef(1.0);
  const fov = 5.5; // perspective strength

  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Hover state
  const [hoveredWord, setHoveredWord] = useState<{ word: WordPoint; px: number; py: number } | null>(null);

  // Canvas size (updated by ResizeObserver)
  const [dims, setDims] = useState({ w: 800, h: 560 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.max(420, Math.floor(height)) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Pre-build word map and transformed points once per data change
  const wordMap = useMemo(
    () => new Map(data.words.map((w) => [w.word, w])),
    [data]
  );

  // ── Draw loop ─────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = dims;
    canvas.width = w;
    canvas.height = h;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    const rx = rxRef.current;
    const ry = ryRef.current;
    const zoom = zoomRef.current;

    // ── Axis lines ───────────────────────────────────────────────────────────
    const axisLen = 3.4;
    const axes: [Vec3, Vec3, string, string][] = [
      [[0, 0, 0], [axisLen, 0, 0], "#6366f1", "PC1"],
      [[0, 0, 0], [0, axisLen, 0], "#10b981", "PC2"],
      [[0, 0, 0], [0, 0, axisLen], "#f59e0b", "PC3"],
    ];
    for (const [from, to, color, label] of axes) {
      const [fx, fy] = project(transform(from as Vec3, rx, ry), cx, cy, fov, zoom);
      const [tx, ty] = project(transform(to as Vec3, rx, ry), cx, cy, fov, zoom);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = color + "55";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = color + "88";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(label, tx + 4, ty + 3);
    }

    // ── Draw a subtle 3-D grid on the bottom plane (y = -3) ──────────────────
    const gridY = -3;
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 0.5;
    for (let xi = -3; xi <= 3; xi++) {
      const [ax2, ay2] = project(transform([xi, gridY, -3], rx, ry), cx, cy, fov, zoom);
      const [bx2, by2] = project(transform([xi, gridY, 3], rx, ry), cx, cy, fov, zoom);
      ctx.beginPath();
      ctx.moveTo(ax2, ay2);
      ctx.lineTo(bx2, by2);
      ctx.strokeStyle = "#27272a";
      ctx.stroke();
    }
    for (let zi = -3; zi <= 3; zi++) {
      const [ax2, ay2] = project(transform([-3, gridY, zi], rx, ry), cx, cy, fov, zoom);
      const [bx2, by2] = project(transform([3, gridY, zi], rx, ry), cx, cy, fov, zoom);
      ctx.beginPath();
      ctx.moveTo(ax2, ay2);
      ctx.lineTo(bx2, by2);
      ctx.strokeStyle = "#27272a";
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── Highlight sets ────────────────────────────────────────────────────────
    const highlightSet = new Set<string>();
    if (selectedWord) {
      highlightSet.add(selectedWord.word);
      selectedWord.neighbors.slice(0, 5).forEach((n) => highlightSet.add(n));
    }
    analogyHighlight?.words?.forEach((w) => highlightSet.add(w));

    const searchLower = searchQuery.trim().toLowerCase();
    const hasHighlight = highlightSet.size > 0;
    const hasSearch = !!searchLower;

    const getAlpha = (d: WordPoint) => {
      if (hasHighlight && !highlightSet.has(d.word)) return 0.08;
      if (hasSearch && !d.word.toLowerCase().includes(searchLower)) return 0.07;
      return 1;
    };

    // ── Transform + sort all points by camera-z (painter's algorithm) ─────────
    const wordZ = (w: WordPoint): Vec3 => [
      w.x,
      w.y,
      (w as WordPoint & { z?: number }).z ?? 0,
    ];

    const projected = data.words.map((w) => {
      const tv = transform(wordZ(w), rx, ry);
      const [sx, sy, depth] = project(tv, cx, cy, fov, zoom);
      return { w, sx, sy, depth };
    });

    // Sort back-to-front
    projected.sort((a, b) => a.depth - b.depth);

    // ── Neighbour lines ───────────────────────────────────────────────────────
    if (selectedWord) {
      const swTV = transform(wordZ(selectedWord), rx, ry);
      const [swX, swY] = project(swTV, cx, cy, fov, zoom);
      selectedWord.neighbors.slice(0, 5).forEach((nw) => {
        const nb = wordMap.get(nw);
        if (!nb) return;
        const [nbX, nbY] = project(transform(wordZ(nb), rx, ry), cx, cy, fov, zoom);
        ctx.beginPath();
        ctx.moveTo(swX, swY);
        ctx.lineTo(nbX, nbY);
        ctx.strokeStyle = "#7c3aed55";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // ── Analogy parallelogram ─────────────────────────────────────────────────
    if (analogyHighlight?.words) {
      const [wa, wb, wc, wr] = analogyHighlight.words.map((w) => wordMap.get(w));
      if (wa && wb && wc && wr) {
        const pts = [wa, wb, wc, wr].map((w) =>
          project(transform(wordZ(w), rx, ry), cx, cy, fov, zoom)
        );
        // Draw two main direction arrows: b→a and c→result
        [[pts[1], pts[0]], [pts[2], pts[3]]].forEach(([from, to]) => {
          ctx.beginPath();
          ctx.moveTo(from[0], from[1]);
          ctx.lineTo(to[0], to[1]);
          ctx.strokeStyle = "#a78bfa";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 3]);
          ctx.stroke();
        });
        // Ghost edges
        [[pts[0], pts[3]], [pts[1], pts[2]]].forEach(([from, to]) => {
          ctx.beginPath();
          ctx.moveTo(from[0], from[1]);
          ctx.lineTo(to[0], to[1]);
          ctx.strokeStyle = "#a78bfa30";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.stroke();
        });
        ctx.setLineDash([]);
      }
    }

    // ── Dots ──────────────────────────────────────────────────────────────────
    for (const { w, sx, sy } of projected) {
      const color = data.categories[w.category]?.color ?? "#94a3b8";
      const alpha = getAlpha(w);
      const isSelected = w.word === selectedWord?.word;
      const isAnalogy = analogyHighlight?.words?.includes(w.word);
      const isHovered = hoveredWord?.word.word === w.word;
      const r = isSelected ? 7 : isAnalogy ? 6 : isHovered ? 5.5 : 4;

      // Depth-based size attenuation for realism (distant = slightly smaller)
      const depthScale = 1; // keep uniform for clarity

      ctx.beginPath();
      ctx.arc(sx, sy, r * depthScale, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, alpha * 0.85);
      ctx.fill();

      if (isSelected || isAnalogy || (searchLower && w.word.toLowerCase().includes(searchLower))) {
        ctx.strokeStyle = isSelected ? "#ffffff" : isAnalogy ? "#a78bfa" : "#fbbf24";
        ctx.lineWidth = isSelected ? 2 : 1.5;
        ctx.stroke();
      }

      // Label for highlighted words
      if (highlightSet.has(w.word) || (searchLower && w.word.toLowerCase().includes(searchLower))) {
        ctx.font = `${isSelected ? "11px" : "10px"} ui-monospace, monospace`;
        ctx.fillStyle = color;
        ctx.fillText(w.word, sx + r + 3, sy + 4);
      }
    }

    // ── HUD: dimension reminder ───────────────────────────────────────────────
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#3f3f46";
    ctx.fillText("3D PCA projection (real space: 12,288 dims)", 10, h - 10);
  }, [data, dims, selectedWord, analogyHighlight, searchQuery, hoveredWord, wordMap]);

  // Redraw whenever dependencies change
  useEffect(() => {
    draw();
  }, [draw]);

  // ── Auto-spin on mount for one rotation (cinematic intro) ─────────────────
  const hasSpun = useRef(false);
  useEffect(() => {
    if (hasSpun.current) return;
    hasSpun.current = true;
    let frame = 0;
    const FRAMES = 90;
    const startRy = ryRef.current;
    const spin = () => {
      if (frame >= FRAMES) return;
      ryRef.current = startRy + (frame / FRAMES) * Math.PI * 0.6;
      frame++;
      draw();
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }, [draw]);

  // ── Mouse / touch interaction ─────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (dragging.current) {
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        ryRef.current += dx * 0.007;
        rxRef.current += dy * 0.007;
        rxRef.current = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rxRef.current));
        lastMouse.current = { x: e.clientX, y: e.clientY };
        draw();
        return;
      }

      // Hover detection: find closest projected point within 10px
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { w, h } = dims;
      const cx = w / 2;
      const cy = h / 2;

      let closest: { word: WordPoint; px: number; py: number } | null = null;
      let minDist = 12;

      for (const word of data.words) {
        const z3 = (word as WordPoint & { z?: number }).z ?? 0;
        const [sx, sy] = project(
          transform([word.x, word.y, z3], rxRef.current, ryRef.current),
          cx,
          cy,
          fov,
          zoomRef.current
        );
        const d = Math.hypot(sx - mx, sy - my);
        if (d < minDist) {
          minDist = d;
          closest = { word, px: mx, py: my };
        }
      }
      setHoveredWord(closest);
    },
    [data, dims, draw]
  );

  const handleMouseUp = () => { dragging.current = false; };

  const handleMouseLeave = () => {
    dragging.current = false;
    setHoveredWord(null);
  };

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.3, Math.min(4, zoomRef.current * (e.deltaY > 0 ? 0.93 : 1.07)));
      draw();
    },
    [draw]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!hoveredWord) return;
      onWordClick(hoveredWord.word);
    },
    [hoveredWord, onWordClick]
  );

  const resetCamera = () => {
    rxRef.current = -0.28;
    ryRef.current = 0.4;
    zoomRef.current = 1.0;
    draw();
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-900"
      style={{ height: 560 }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: dragging.current ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onClick={handleClick}
      />

      {/* Controls hint */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px] text-zinc-600 pointer-events-none select-none">
        <span>drag to rotate</span>
        <span>·</span>
        <span>scroll to zoom</span>
        <span>·</span>
        <span>click to select</span>
      </div>

      {/* Reset + zoom indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <button
          onClick={resetCamera}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded px-1.5 py-0.5 transition-colors"
        >
          reset view
        </button>
      </div>

      {/* Axis legend */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
        {[["PC1", "#6366f1"], ["PC2", "#10b981"], ["PC3", "#f59e0b"]].map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-[10px] font-mono" style={{ color }}>{label}</span>
          </div>
        ))}
        <div className="mt-1 text-[9px] text-zinc-600 leading-tight max-w-[120px]">
          3 of 12,288 dims shown
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredWord && (
        <div
          className="absolute pointer-events-none z-10"
          style={{ left: hoveredWord.px + 14, top: hoveredWord.py - 40 }}
        >
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
            <span
              className="font-mono font-semibold text-sm block"
              style={{ color: data.categories[hoveredWord.word.category]?.color ?? "#94a3b8" }}
            >
              {hoveredWord.word.word}
            </span>
            <span className="text-zinc-500 text-[11px]">
              {data.categories[hoveredWord.word.category]?.label ?? hoveredWord.word.category}
              {" · "}
              <span className="text-zinc-400">
                neighbors: {hoveredWord.word.neighbors.slice(0, 3).join(", ")}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
