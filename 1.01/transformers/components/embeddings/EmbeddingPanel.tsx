"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { EmbeddingData, WordPoint } from "./EmbeddingPlot";
import AnalogyArithmetic from "./AnalogyArithmetic";

const EmbeddingPlot = dynamic(() => import("./EmbeddingPlot"), { ssr: false });

// Fixed word budget — proportional across categories so every group stays represented
const WORD_LIMIT = 80;

function sampleWords(words: WordPoint[], limit: number): WordPoint[] {
  if (limit >= words.length) return words;

  const byCategory = new Map<string, WordPoint[]>();
  for (const w of words) {
    if (!byCategory.has(w.category)) byCategory.set(w.category, []);
    byCategory.get(w.category)!.push(w);
  }

  const categories = Array.from(byCategory.keys());
  const allocs = new Map<string, number>();
  let allocated = 0;
  const remainders: { cat: string; rem: number }[] = [];

  for (const cat of categories) {
    const exact = (byCategory.get(cat)!.length / words.length) * limit;
    const floored = Math.floor(exact);
    allocs.set(cat, floored);
    allocated += floored;
    remainders.push({ cat, rem: exact - floored });
  }

  remainders.sort((a, b) => b.rem - a.rem);
  let remaining = limit - allocated;
  for (const { cat } of remainders) {
    if (remaining === 0) break;
    allocs.set(cat, allocs.get(cat)! + 1);
    remaining--;
  }

  const result: WordPoint[] = [];
  for (const cat of categories) {
    const take = Math.min(allocs.get(cat) ?? 0, byCategory.get(cat)!.length);
    result.push(...byCategory.get(cat)!.slice(0, take));
  }
  return result;
}

// ─── Category Legend ──────────────────────────────────────────────────────────

function CategoryLegend({
  categories,
  activeCategories,
  onToggle,
}: {
  categories: EmbeddingData["categories"];
  activeCategories: Set<string>;
  onToggle: (cat: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(categories).map(([key, meta]) => (
        <button
          key={key}
          onClick={() => onToggle(key)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
            activeCategories.has(key)
              ? "border-transparent opacity-100"
              : "opacity-30 border-zinc-700 grayscale"
          }`}
          style={
            activeCategories.has(key)
              ? {
                  backgroundColor: meta.color + "22",
                  borderColor: meta.color + "60",
                  color: meta.color,
                }
              : {}
          }
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: meta.color }}
          />
          {meta.label}
        </button>
      ))}
    </div>
  );
}

// ─── Neighbour List ───────────────────────────────────────────────────────────

function NeighborList({
  word,
  data,
  onWordClick,
}: {
  word: WordPoint | null;
  data: EmbeddingData;
  onWordClick: (w: WordPoint) => void;
}) {
  if (!word) {
    return (
      <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-6 text-center text-zinc-600 text-sm">
        Click any word to see its nearest neighbours
      </div>
    );
  }

  const wordMap = new Map(data.words.map((w) => [w.word, w]));
  const neighbours = word.neighbors
    .slice(0, 5)
    .map((n) => wordMap.get(n))
    .filter((n): n is WordPoint => !!n);

  const dist = (a: WordPoint, b: WordPoint) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  const maxDist = Math.max(...neighbours.map((n) => dist(word, n)), 1);

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: data.categories[word.category]?.color ?? "#94a3b8" }}
        />
        <span className="text-zinc-100 font-mono font-semibold text-sm">
          {word.word}
        </span>
        <span className="text-zinc-600 text-xs ml-1">— nearest neighbours</span>
      </div>
      <div className="divide-y divide-zinc-800">
        {neighbours.map((nb, i) => {
          const d = dist(word, nb);
          const sim = Math.max(0, 1 - d / (maxDist * 1.2));
          return (
            <button
              key={nb.word}
              onClick={() => onWordClick(nb)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors text-left"
            >
              <span className="text-zinc-600 text-xs w-4">{i + 1}</span>
              <span
                className="font-mono text-sm font-medium"
                style={{ color: data.categories[nb.category]?.color ?? "#94a3b8" }}
              >
                {nb.word}
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
                      backgroundColor: data.categories[nb.category]?.color ?? "#94a3b8",
                    }}
                  />
                </div>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Analogy Explorer ─────────────────────────────────────────────────────────

function AnalogyExplorer({
  data,
  onHighlight,
}: {
  data: EmbeddingData;
  onHighlight: (h: {
    words: string[];
    vector?: { ax: number; ay: number; bx: number; by: number; cx: number; cy: number; rx: number; ry: number };
  } | null) => void;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const wordMap = useMemo(
    () => new Map(data.words.map((w) => [w.word, w])),
    [data]
  );

  const handleSelect = (idx: number) => {
    if (activeIdx === idx) {
      setActiveIdx(null);
      onHighlight(null);
      return;
    }
    setActiveIdx(idx);
    const a = data.analogies[idx];
    const wa = wordMap.get(a.a);
    const wb = wordMap.get(a.b);
    const wc = wordMap.get(a.c);
    const wr = wordMap.get(a.result);
    if (!wa || !wb || !wc || !wr) return;
    onHighlight({
      words: [a.a, a.b, a.c, a.result],
      vector: { ax: wa.x, ay: wa.y, bx: wb.x, by: wb.y, cx: wc.x, cy: wc.y, rx: wr.x, ry: wr.y },
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-zinc-400 text-sm font-medium">Vector Analogies</p>
        <p className="text-zinc-600 text-xs mt-0.5">
          Click to draw the parallelogram geometry on the plot
        </p>
      </div>
      <div className="divide-y divide-zinc-800">
        {data.analogies.map((analogy, idx) => (
          <button
            key={idx}
            onClick={() => handleSelect(idx)}
            className={`w-full px-4 py-3 text-left transition-colors ${
              activeIdx === idx ? "bg-violet-950/40" : "hover:bg-zinc-800/40"
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <span className="font-mono text-sm text-violet-300">{analogy.a}</span>
              <span className="text-zinc-600 text-xs">−</span>
              <span className="font-mono text-sm text-zinc-400">{analogy.b}</span>
              <span className="text-zinc-600 text-xs">+</span>
              <span className="font-mono text-sm text-zinc-400">{analogy.c}</span>
              <span className="text-zinc-600 text-xs">≈</span>
              <span className="font-mono text-sm text-emerald-400">{analogy.result}</span>
              {activeIdx === idx && (
                <span className="text-[10px] text-violet-400 border border-violet-500/40 rounded px-1.5 py-0.5">
                  active
                </span>
              )}
            </div>
            <p className="text-zinc-600 text-xs leading-relaxed">{analogy.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function EmbeddingPanel() {
  const [rawData, setRawData] = useState<EmbeddingData | null>(null);
  const [selectedWord, setSelectedWord] = useState<WordPoint | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [analogyHighlight, setAnalogyHighlight] = useState<{
    words: string[];
    vector?: { ax: number; ay: number; bx: number; by: number; cx: number; cy: number; rx: number; ry: number };
  } | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/data/embeddings.json")
      .then((r) => r.json())
      .then((d: EmbeddingData) => {
        setRawData(d);
        setActiveCategories(new Set(Object.keys(d.categories)));
      });
  }, []);

  // Fixed 80-word sample, then category filter
  const displayData = useMemo<EmbeddingData | null>(() => {
    if (!rawData) return null;
    const sampled = sampleWords(rawData.words, WORD_LIMIT);
    const filtered = sampled.filter((w) => activeCategories.has(w.category));
    return { ...rawData, words: filtered };
  }, [rawData, activeCategories]);

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  if (!rawData || !displayData) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-600 text-sm gap-3">
        <span className="animate-spin w-4 h-4 border-2 border-zinc-700 border-t-violet-500 rounded-full inline-block" />
        Loading embeddings…
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Embedding Space</h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            Showing{" "}
            <span className="text-zinc-300 font-mono">{displayData.words.length}</span>
            {" "}words · scroll to zoom · drag to pan
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search words…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg pl-8 pr-8 py-1.5 focus:outline-none focus:border-violet-500 w-44 placeholder:text-zinc-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Category filter */}
      <CategoryLegend
        categories={rawData.categories}
        activeCategories={activeCategories}
        onToggle={toggleCategory}
      />

      {/* Plot */}
      <EmbeddingPlot
        data={displayData}
        searchQuery={searchQuery}
        analogyHighlight={analogyHighlight}
        onWordClick={(w) => {
          setSelectedWord((prev) => (prev?.word === w.word ? null : w));
          setAnalogyHighlight(null);
        }}
        selectedWord={selectedWord}
      />

      {/* Vector Arithmetic */}
      <AnalogyArithmetic
        data={rawData}
        onHighlight={(h) => {
          setAnalogyHighlight(h);
          setSelectedWord(null);
        }}
      />

      {/* Bottom panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NeighborList
          word={selectedWord}
          data={displayData}
          onWordClick={setSelectedWord}
        />
        <AnalogyExplorer
          data={rawData}
          onHighlight={(h) => {
            setAnalogyHighlight(h);
            setSelectedWord(null);
          }}
        />
      </div>
    </div>
  );
}
