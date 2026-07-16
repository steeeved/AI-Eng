"use client";

import { useState, useMemo, useCallback } from "react";
import type { EmbeddingData, WordPoint } from "./EmbeddingPlot";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AnalogyHighlight {
  words: string[];
  vector?: {
    ax: number; ay: number;
    bx: number; by: number;
    cx: number; cy: number;
    rx: number; ry: number;
  };
}

interface Props {
  data: EmbeddingData;
  onHighlight: (h: AnalogyHighlight | null) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Euclidean distance between two points in PCA space (x, y, z). */
function dist3(a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }) {
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + dz ** 2);
}

/** Compute A − B + C in PCA coordinates. */
function vectorArithmetic(
  a: WordPoint,
  b: WordPoint,
  c: WordPoint
): { x: number; y: number; z: number } {
  return {
    x: a.x - b.x + c.x,
    y: a.y - b.y + c.y,
    z: (a.z ?? 0) - (b.z ?? 0) + (c.z ?? 0),
  };
}

/** Return the top-N nearest words to a target point (excluding given words). */
function nearestWords(
  target: { x: number; y: number; z?: number },
  words: WordPoint[],
  exclude: Set<string>,
  n: number
): { word: WordPoint; distance: number }[] {
  return words
    .filter((w) => !exclude.has(w.word))
    .map((w) => ({ word: w, distance: dist3(target, w) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}

// ─── Word Picker (filterable dropdown) ──────────────────────────────────────

function WordPicker({
  label,
  value,
  words,
  categories,
  onChange,
  color,
}: {
  label: string;
  value: string;
  words: WordPoint[];
  categories: EmbeddingData["categories"];
  onChange: (word: string) => void;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return words.slice(0, 60);
    return words.filter((w) => w.word.toLowerCase().includes(q)).slice(0, 60);
  }, [words, filter]);

  const selectedWord = words.find((w) => w.word === value);

  const handleSelect = useCallback(
    (word: string) => {
      onChange(word);
      setOpen(false);
      setFilter("");
    },
    [onChange]
  );

  return (
    <div className="relative">
      <span className="text-zinc-600 text-[10px] uppercase tracking-wider font-medium block mb-1">
        {label}
      </span>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 bg-zinc-800 border rounded-lg px-3 py-2 text-left transition-colors hover:border-zinc-500"
        style={{ borderColor: open ? color : undefined }}
      >
        {selectedWord && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: categories[selectedWord.category]?.color }}
          />
        )}
        <span className="font-mono text-sm font-semibold" style={{ color }}>
          {value || "pick a word"}
        </span>
        <svg
          className="w-3 h-3 ml-auto text-zinc-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-56 bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-zinc-700">
            <input
              autoFocus
              type="text"
              placeholder="Search words..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5 focus:outline-none focus:border-violet-500 placeholder:text-zinc-600"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-zinc-600 text-xs">No matches</div>
            ) : (
              filtered.map((w) => (
                <button
                  key={w.word}
                  onClick={() => handleSelect(w.word)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-700/60 transition-colors ${
                    w.word === value ? "bg-violet-950/40" : ""
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: categories[w.category]?.color }}
                  />
                  <span className="font-mono text-zinc-200">{w.word}</span>
                  <span className="text-zinc-600 text-[10px] ml-auto">
                    {categories[w.category]?.label}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Close on outside click */}
      {open && (
        <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setFilter(""); }} />
      )}
    </div>
  );
}

// ─── Result Row ─────────────────────────────────────────────────────────────

function ResultRow({
  rank,
  word,
  distance,
  maxDistance,
  categories,
  isBest,
}: {
  rank: number;
  word: WordPoint;
  distance: number;
  maxDistance: number;
  categories: EmbeddingData["categories"];
  isBest: boolean;
}) {
  const sim = Math.max(0, 1 - distance / (maxDistance * 1.2));
  const catColor = categories[word.category]?.color ?? "#94a3b8";

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 ${
        isBest ? "bg-emerald-950/30" : ""
      }`}
    >
      <span className="text-zinc-600 text-xs w-4 font-mono">{rank}</span>
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: catColor }}
      />
      <span
        className={`font-mono text-sm ${isBest ? "font-bold" : "font-medium"}`}
        style={{ color: isBest ? "#6ee7b7" : catColor }}
      >
        {word.word}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-zinc-600 text-xs font-mono">
          {(sim * 100).toFixed(0)}%
        </span>
        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${sim * 100}%`,
              backgroundColor: isBest ? "#6ee7b7" : catColor,
            }}
          />
        </div>
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AnalogyArithmetic({ data, onHighlight }: Props) {
  const [wordA, setWordA] = useState("king");
  const [wordB, setWordB] = useState("man");
  const [wordC, setWordC] = useState("woman");
  const [showOnPlot, setShowOnPlot] = useState(false);

  const wordMap = useMemo(
    () => new Map(data.words.map((w) => [w.word, w])),
    [data]
  );

  const sortedWords = useMemo(
    () => [...data.words].sort((a, b) => a.word.localeCompare(b.word)),
    [data]
  );

  // Compute result
  const result = useMemo(() => {
    const a = wordMap.get(wordA);
    const b = wordMap.get(wordB);
    const c = wordMap.get(wordC);
    if (!a || !b || !c) return null;

    const targetVec = vectorArithmetic(a, b, c);
    const exclude = new Set([wordA, wordB, wordC]);
    const nearest = nearestWords(targetVec, data.words, exclude, 5);
    return { targetVec, nearest };
  }, [wordA, wordB, wordC, wordMap, data.words]);

  // Highlight on plot
  const handleShowOnPlot = useCallback(() => {
    if (!result || result.nearest.length === 0) return;
    const a = wordMap.get(wordA);
    const b = wordMap.get(wordB);
    const c = wordMap.get(wordC);
    const r = result.nearest[0].word;
    if (!a || !b || !c) return;

    const newShow = !showOnPlot;
    setShowOnPlot(newShow);

    if (newShow) {
      onHighlight({
        words: [wordA, wordB, wordC, r.word],
        vector: {
          ax: a.x, ay: a.y,
          bx: b.x, by: b.y,
          cx: c.x, cy: c.y,
          rx: r.x, ry: r.y,
        },
      });
    } else {
      onHighlight(null);
    }
  }, [result, showOnPlot, wordA, wordB, wordC, wordMap, onHighlight]);

  // Clear plot highlight when inputs change
  const handleWordChange = useCallback(
    (setter: (v: string) => void) => (word: string) => {
      setter(word);
      setShowOnPlot(false);
      onHighlight(null);
    },
    [onHighlight]
  );

  const bestWord = result?.nearest[0]?.word;
  const maxDist = result ? Math.max(...result.nearest.map((n) => n.distance), 0.01) : 1;

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-zinc-400 text-sm font-medium">Vector Arithmetic</p>
        <p className="text-zinc-600 text-xs mt-0.5">
          Pick three words to compute <span className="font-mono text-zinc-500">A − B + C</span> and find the nearest result
        </p>
      </div>

      {/* Equation inputs */}
      <div className="px-4 pt-4 pb-2">
        <div className="grid grid-cols-3 gap-3">
          <WordPicker
            label="A"
            value={wordA}
            words={sortedWords}
            categories={data.categories}
            onChange={handleWordChange(setWordA)}
            color="#c4b5fd"
          />
          <WordPicker
            label="− B"
            value={wordB}
            words={sortedWords}
            categories={data.categories}
            onChange={handleWordChange(setWordB)}
            color="#fda4af"
          />
          <WordPicker
            label="+ C"
            value={wordC}
            words={sortedWords}
            categories={data.categories}
            onChange={handleWordChange(setWordC)}
            color="#93c5fd"
          />
        </div>

        {/* Equation display */}
        <div className="flex items-center justify-center gap-2 mt-4 py-3 bg-zinc-950/60 rounded-lg border border-zinc-800">
          <span className="font-mono text-sm font-semibold text-violet-300">{wordA}</span>
          <span className="text-zinc-600 text-sm">−</span>
          <span className="font-mono text-sm font-semibold text-rose-300">{wordB}</span>
          <span className="text-zinc-600 text-sm">+</span>
          <span className="font-mono text-sm font-semibold text-blue-300">{wordC}</span>
          <span className="text-zinc-600 text-sm">=</span>
          {bestWord ? (
            <span className="font-mono text-sm font-bold text-emerald-400">
              {bestWord.word}
            </span>
          ) : (
            <span className="text-zinc-600 text-sm">?</span>
          )}
        </div>
      </div>

      {/* Results */}
      {result && result.nearest.length > 0 && (
        <div className="mt-2">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-zinc-600 text-[10px] uppercase tracking-wider font-medium">
              Nearest words to computed vector
            </span>
            <button
              onClick={handleShowOnPlot}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                showOnPlot
                  ? "bg-violet-950/40 border-violet-500/40 text-violet-300"
                  : "border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {showOnPlot ? "Hide from plot" : "Show on plot"}
            </button>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {result.nearest.map((n, i) => (
              <ResultRow
                key={n.word.word}
                rank={i + 1}
                word={n.word}
                distance={n.distance}
                maxDistance={maxDist}
                categories={data.categories}
                isBest={i === 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <p className="text-zinc-600 text-[11px] leading-relaxed">
          The arithmetic is performed on PCA-reduced coordinates (3 dims from 12,288).
          Results are approximate but illustrate how semantic relationships emerge as
          geometric directions in embedding space.
        </p>
      </div>
    </div>
  );
}
