"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WordPoint {
  word: string;
  x: number;
  y: number;
  z?: number;
  category: string;
  neighbors: string[];
}

export interface CategoryMeta {
  color: string;
  label: string;
}

export interface EmbeddingData {
  words: WordPoint[];
  analogies: {
    label: string;
    a: string;
    b: string;
    c: string;
    result: string;
    description: string;
  }[];
  categories: Record<string, CategoryMeta>;
}

interface TooltipState {
  word: WordPoint;
  x: number; // px from container left
  y: number; // px from container top
}

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

// ─── Zoom-level label threshold (k = zoom scale factor) ────────────────────
const LABEL_ZOOM_THRESHOLD = 3.5; // show ALL visible labels above this zoom

// ─── EmbeddingPlot ──────────────────────────────────────────────────────────

export default function EmbeddingPlot({
  data,
  searchQuery,
  analogyHighlight,
  onWordClick,
  selectedWord,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 560 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [zoomK, setZoomK] = useState(1); // current zoom scale

  // Persist zoom transform across re-draws
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  // Store zoom behaviour ref so we can programmatically reset
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.max(420, Math.floor(height)) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    if (!svgRef.current || !data || !containerRef.current) return;
    const { w, h } = dims;
    const M = { top: 20, right: 20, bottom: 20, left: 20 };
    const iW = w - M.left - M.right;
    const iH = h - M.top - M.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", w).attr("height", h);

    // ── Scales ──────────────────────────────────────────────────────────────
    const xExt = d3.extent(data.words, (d) => d.x) as [number, number];
    const yExt = d3.extent(data.words, (d) => d.y) as [number, number];
    const dW = xExt[1] - xExt[0] || 1;
    const dH = yExt[1] - yExt[0] || 1;
    const pad = 0.1;

    const xScale = d3
      .scaleLinear()
      .domain([xExt[0] - dW * pad, xExt[1] + dW * pad])
      .range([0, iW]);
    const yScale = d3
      .scaleLinear()
      .domain([yExt[0] - dH * pad, yExt[1] + dH * pad])
      .range([iH, 0]);

    // ── Root group ──────────────────────────────────────────────────────────
    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
    const gZoom = root.append("g").attr("class", "zoom-group");

    // ── Grid ────────────────────────────────────────────────────────────────
    const gGrid = gZoom.append("g");
    gGrid.selectAll("line.gx").data(xScale.ticks(10)).join("line")
      .attr("x1", xScale).attr("x2", xScale)
      .attr("y1", 0).attr("y2", iH)
      .attr("stroke", "#27272a").attr("stroke-width", 0.5);
    gGrid.selectAll("line.gy").data(yScale.ticks(10)).join("line")
      .attr("x1", 0).attr("x2", iW)
      .attr("y1", yScale).attr("y2", yScale)
      .attr("stroke", "#27272a").attr("stroke-width", 0.5);

    // ── Analogy arrows ──────────────────────────────────────────────────────
    const gAnalogy = gZoom.append("g");
    if (analogyHighlight?.vector) {
      const v = analogyHighlight.vector;
      svg.append("defs").append("marker")
        .attr("id", "arr").attr("viewBox", "0 -5 10 10")
        .attr("refX", 8).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#a78bfa");

      [[v.bx, v.by, v.ax, v.ay], [v.cx, v.cy, v.rx, v.ry]].forEach(([x1, y1, x2, y2]) => {
        gAnalogy.append("line")
          .attr("x1", xScale(x1)).attr("y1", yScale(y1))
          .attr("x2", xScale(x2)).attr("y2", yScale(y2))
          .attr("stroke", "#a78bfa").attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "5 3").attr("marker-end", "url(#arr)");
      });
      // parallelogram edges
      [[v.ax, v.ay, v.rx, v.ry], [v.bx, v.by, v.cx, v.cy]].forEach(([x1, y1, x2, y2]) => {
        gAnalogy.append("line")
          .attr("x1", xScale(x1)).attr("y1", yScale(y1))
          .attr("x2", xScale(x2)).attr("y2", yScale(y2))
          .attr("stroke", "#a78bfa30").attr("stroke-width", 1).attr("stroke-dasharray", "2 4");
      });
    }

    // ── Neighbour lines ─────────────────────────────────────────────────────
    const gNb = gZoom.append("g");
    if (selectedWord) {
      const wm = new Map(data.words.map((w) => [w.word, w]));
      selectedWord.neighbors.slice(0, 5).forEach((nw) => {
        const nb = wm.get(nw);
        if (!nb) return;
        gNb.append("line")
          .attr("x1", xScale(selectedWord.x)).attr("y1", yScale(selectedWord.y))
          .attr("x2", xScale(nb.x)).attr("y2", yScale(nb.y))
          .attr("stroke", "#7c3aed70").attr("stroke-width", 1.5).attr("stroke-dasharray", "3 3");
      });
    }

    // ── Determine which words get permanent labels ───────────────────────────
    const permanentLabels = new Set<string>();
    if (selectedWord) {
      permanentLabels.add(selectedWord.word);
      selectedWord.neighbors.slice(0, 5).forEach((n) => permanentLabels.add(n));
    }
    analogyHighlight?.words?.forEach((w) => permanentLabels.add(w));

    // ── Helper: should a word be dimmed? ────────────────────────────────────
    const searchLower = searchQuery.trim().toLowerCase();
    const hasHighlight = permanentLabels.size > 0;
    const hasSearch = !!searchLower;

    const getOpacity = (d: WordPoint) => {
      if (hasHighlight && !permanentLabels.has(d.word)) return 0.12;
      if (hasSearch && !d.word.toLowerCase().includes(searchLower)) return 0.08;
      return 1;
    };

    // ── Dots layer ──────────────────────────────────────────────────────────
    const gDots = gZoom.append("g").attr("class", "dots");

    // Sort: dimmed words first so highlighted dots render on top
    const sorted = [...data.words].sort((a, b) => {
      const oa = getOpacity(a);
      const ob = getOpacity(b);
      return oa - ob; // dimmed first
    });

    const nodes = gDots
      .selectAll<SVGCircleElement, WordPoint>("circle")
      .data(sorted, (d) => d.word)
      .join("circle")
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", (d) => {
        if (d.word === selectedWord?.word) return 7;
        if (analogyHighlight?.words?.includes(d.word)) return 6;
        return 4;
      })
      .attr("fill", (d) => data.categories[d.category]?.color ?? "#94a3b8")
      .attr("fill-opacity", (d) => getOpacity(d) * 0.8)
      .attr("stroke", (d) => {
        if (d.word === selectedWord?.word) return "#fff";
        if (analogyHighlight?.words?.includes(d.word)) return "#a78bfa";
        if (searchLower && d.word.toLowerCase().includes(searchLower)) return "#fbbf24";
        return "none";
      })
      .attr("stroke-width", (d) =>
        d.word === selectedWord?.word ? 2 : 1.5
      )
      .style("cursor", "pointer");

    // ── Labels layer (permanent only) ───────────────────────────────────────
    const gLabels = gZoom.append("g").attr("class", "labels");

    const labelWords = data.words.filter((w) => permanentLabels.has(w.word));
    gLabels
      .selectAll<SVGTextElement, WordPoint>("text")
      .data(labelWords, (d) => d.word)
      .join("text")
      .attr("x", (d) => xScale(d.x))
      .attr("y", (d) => yScale(d.y) + (d.word === selectedWord?.word ? 18 : 15))
      .attr("text-anchor", "middle")
      .attr("font-size", (d) => (d.word === selectedWord?.word ? "11px" : "10px"))
      .attr("font-weight", (d) => (d.word === selectedWord?.word ? "600" : "400"))
      .attr("font-family", "ui-monospace, monospace")
      .attr("fill", (d) => data.categories[d.category]?.color ?? "#94a3b8")
      .attr("pointer-events", "none")
      .text((d) => d.word);

    // ── Zoom-level labels (when deeply zoomed in) ───────────────────────────
    // Redrawn on each zoom event — handled inside the zoom handler below

    // ── Mouse events for hover tooltip ─────────────────────────────────────
    const containerEl = containerRef.current;

    nodes
      .on("mouseover", function (event, d) {
        d3.select(this).attr("r", (n) => {
          if ((n as WordPoint).word === selectedWord?.word) return 8;
          if (analogyHighlight?.words?.includes((n as WordPoint).word)) return 7;
          return 5.5;
        });

        const rect = containerEl.getBoundingClientRect();
        const [mx, my] = d3.pointer(event, containerEl);
        setTooltip({ word: d, x: mx, y: my });
      })
      .on("mousemove", function (event) {
        const [mx, my] = d3.pointer(event, containerEl);
        setTooltip((prev) => prev ? { ...prev, x: mx, y: my } : prev);
      })
      .on("mouseout", function (_, d) {
        d3.select(this).attr("r", () => {
          if (d.word === selectedWord?.word) return 7;
          if (analogyHighlight?.words?.includes(d.word)) return 6;
          return 4;
        });
        setTooltip(null);
      })
      .on("click", (_, d) => onWordClick(d));

    // ── Zoom behaviour ──────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 12])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        gZoom.attr("transform", event.transform);
        setZoomK(event.transform.k);

        // Zoom-adaptive labels: show all when deeply zoomed
        gLabels.selectAll<SVGTextElement, WordPoint>("text").remove();

        const k = event.transform.k;
        const showAll = k >= LABEL_ZOOM_THRESHOLD;

        const toLabel = showAll ? data.words : data.words.filter((w) => permanentLabels.has(w.word));

        gLabels
          .selectAll<SVGTextElement, WordPoint>("text")
          .data(toLabel, (d) => d.word)
          .join("text")
          .attr("x", (d) => xScale(d.x))
          .attr("y", (d) => yScale(d.y) + (d.word === selectedWord?.word ? 18 : 14))
          .attr("text-anchor", "middle")
          .attr("font-size", showAll ? `${Math.max(7, 10 / k)}px` : (d) =>
            d.word === selectedWord?.word ? "11px" : "10px"
          )
          .attr("font-weight", (d) => (d.word === selectedWord?.word ? "600" : "400"))
          .attr("font-family", "ui-monospace, monospace")
          .attr("fill", (d) => {
            if (!showAll && getOpacity(d) < 0.5) return "#52525b";
            return data.categories[d.category]?.color ?? "#94a3b8";
          })
          .attr("fill-opacity", showAll ? 0.85 : 1)
          .attr("pointer-events", "none")
          .text((d) => d.word);
      });

    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, transformRef.current);
  }, [data, dims, selectedWord, analogyHighlight, searchQuery, onWordClick]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Reset zoom button handler
  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    transformRef.current = d3.zoomIdentity;
    d3.select(svgRef.current)
      .transition().duration(400)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-900"
      style={{ height: 560 }}
    >
      <svg ref={svgRef} className="w-full h-full" />

      {/* Zoom indicator + reset */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span className="text-zinc-600 text-[10px] font-mono tabular-nums">
          {zoomK.toFixed(1)}×
        </span>
        {Math.abs(zoomK - 1) > 0.05 && (
          <button
            onClick={resetZoom}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded px-1.5 py-0.5 transition-colors"
          >
            reset
          </button>
        )}
        <span className="text-zinc-700 text-[10px]">
          {zoomK < LABEL_ZOOM_THRESHOLD
            ? `zoom to ${LABEL_ZOOM_THRESHOLD}× for all labels`
            : "labels visible"}
        </span>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 36,
          }}
        >
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 shadow-xl flex flex-col gap-0.5 whitespace-nowrap">
            <span
              className="font-mono font-semibold text-sm"
              style={{ color: data.categories[tooltip.word.category]?.color ?? "#94a3b8" }}
            >
              {tooltip.word.word}
            </span>
            <span className="text-zinc-500 text-[11px]">
              {data.categories[tooltip.word.category]?.label ?? tooltip.word.category}
              {" · "}
              <span className="text-zinc-400">
                neighbors: {tooltip.word.neighbors.slice(0, 3).join(", ")}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
