"use client";

import { useState } from "react";

interface HoverInfo {
  fromIdx: number;
  toIdx: number;
  weight: number;
}

interface Props {
  tokens: string[];
  /** matrix[from][to] — rows sum to 1 */
  matrix: number[][];
  highlightCoref?: { from: number; to: number } | null;
}

/** Map weight 0..1 → CSS colour (dark → violet → white) */
function weightToColor(w: number): { bg: string; text: string } {
  // Use a violet-to-white gradient with a dark base
  if (w < 0.01) return { bg: "rgba(39,39,42,0.6)", text: "#52525b" };

  // violet hue: 270°
  const t = Math.pow(w, 0.55); // gamma compress so small values pop
  const r = Math.round(59  + t * (255 - 59));
  const g = Math.round(7   + t * (255 - 7));
  const b = Math.round(100 + t * (255 - 100));
  const textL = t > 0.55 ? "#18181b" : "#f4f4f5";
  return {
    bg: `rgb(${r},${g},${b})`,
    text: textL,
  };
}

export default function AttentionHeatmap({ tokens, matrix, highlightCoref }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const n = tokens.length;

  // Find the max weight in the full matrix (for relative scaling tooltip)
  const allWeights = matrix.flat();
  const globalMax = Math.max(...allWeights);

  // Cell size: shrink if many tokens
  const cellSize = n <= 12 ? 52 : n <= 16 ? 44 : 36;
  const labelW   = n <= 12 ? 72 : 56;
  const fontSize = n <= 12 ? 12 : 10;

  return (
    <div className="flex flex-col gap-3">
      {/* Hover readout */}
      <div className="h-8 flex items-center">
        {hover ? (
          <p className="text-sm text-zinc-300">
            <span className="font-mono text-violet-300 font-semibold">
              "{tokens[hover.fromIdx]}"
            </span>
            {" attends to "}
            <span className="font-mono text-violet-300 font-semibold">
              "{tokens[hover.toIdx]}"
            </span>
            {" with weight "}
            <span className="font-mono font-bold text-white">
              {(hover.weight * 100).toFixed(1)}%
            </span>
            {hover.weight === globalMax && (
              <span className="ml-2 text-[10px] text-amber-400 border border-amber-500/40 rounded px-1.5 py-0.5">
                peak
              </span>
            )}
          </p>
        ) : (
          <p className="text-zinc-600 text-sm">Hover any cell to read the attention weight</p>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${labelW}px repeat(${n}, ${cellSize}px)`,
            gridTemplateRows: `${labelW}px repeat(${n}, ${cellSize}px)`,
            gap: 2,
          }}
        >
          {/* Top-left corner */}
          <div className="flex items-end justify-end pb-1 pr-1">
            <span className="text-zinc-700 text-[9px] font-mono rotate-0">from ↓ to →</span>
          </div>

          {/* Column headers (KEY tokens — being attended to) */}
          {tokens.map((tok, j) => (
            <div
              key={`col-${j}`}
              className="flex items-end justify-center pb-1"
              style={{
                opacity: hover && hover.toIdx !== j ? 0.35 : 1,
                transition: "opacity 0.1s",
              }}
            >
              <span
                className="font-mono text-zinc-300 whitespace-nowrap"
                style={{
                  fontSize,
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  textAlign: "center",
                  color:
                    highlightCoref?.to === j
                      ? "#a78bfa"
                      : hover?.toIdx === j
                      ? "#e4e4e7"
                      : "#71717a",
                }}
              >
                {tok}
              </span>
            </div>
          ))}

          {/* Rows */}
          {tokens.map((rowTok, i) => (
            <>
              {/* Row header (QUERY token — doing the attending) */}
              <div
                key={`row-${i}`}
                className="flex items-center justify-end pr-2"
                style={{
                  opacity: hover && hover.fromIdx !== i ? 0.35 : 1,
                  transition: "opacity 0.1s",
                }}
              >
                <span
                  className="font-mono text-right truncate"
                  style={{
                    fontSize,
                    maxWidth: labelW - 8,
                    color:
                      highlightCoref?.from === i
                        ? "#a78bfa"
                        : hover?.fromIdx === i
                        ? "#e4e4e7"
                        : "#71717a",
                  }}
                >
                  {rowTok}
                </span>
              </div>

              {/* Cells */}
              {tokens.map((_, j) => {
                const w = matrix[i]?.[j] ?? 0;
                const { bg, text } = weightToColor(w);
                const isHighlight =
                  highlightCoref &&
                  i === highlightCoref.from &&
                  j === highlightCoref.to;
                const isFuture = j > i; // causal: can't attend to future

                return (
                  <div
                    key={`cell-${i}-${j}`}
                    onMouseEnter={() =>
                      !isFuture && setHover({ fromIdx: i, toIdx: j, weight: w })
                    }
                    onMouseLeave={() => setHover(null)}
                    style={{
                      backgroundColor: bg,
                      borderRadius: 4,
                      cursor: isFuture ? "default" : "crosshair",
                      outline: isHighlight ? "2px solid #a78bfa" : "none",
                      outlineOffset: -1,
                      transition: "filter 0.1s",
                      filter:
                        hover && (hover.fromIdx !== i && hover.toIdx !== j)
                          ? "brightness(0.55)"
                          : "none",
                    }}
                    className="flex items-center justify-center select-none"
                  >
                    {w >= 0.08 && (
                      <span
                        style={{ fontSize: Math.max(8, fontSize - 1), color: text }}
                        className="font-mono font-semibold tabular-nums"
                      >
                        {(w * 100).toFixed(0)}
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Colour scale legend */}
      <div className="flex items-center gap-3 mt-1">
        <span className="text-zinc-600 text-xs">Low</span>
        <div
          className="h-3 rounded flex-1 max-w-48"
          style={{
            background:
              "linear-gradient(to right, rgba(39,39,42,0.6), rgb(120,50,180), rgb(200,100,255), white)",
          }}
        />
        <span className="text-zinc-600 text-xs">High attention</span>
        <span className="text-zinc-700 text-[10px] ml-4">
          Numbers shown for weights ≥ 8%
        </span>
      </div>
    </div>
  );
}
