"use client";

import { useState, useEffect, useCallback } from "react";
import AttentionHeatmap from "./AttentionHeatmap";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AttentionData {
  id: string;
  text: string;
  tokens: string[];
  n_layers: number;
  n_heads: number;
  coref: { token_from: number; token_to: number; layers: number[]; heads: number[] };
  attention: number[][][][]; // [layer][head][from][to]
}

interface ManifestEntry {
  id: string;
  text: string;
  tokens: string[];
}

// ─── Sentence Picker ─────────────────────────────────────────────────────────

function SentencePicker({
  manifest,
  activeId,
  onSelect,
}: {
  manifest: ManifestEntry[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-zinc-500 text-sm font-medium">Choose a sentence</span>
      <div className="flex flex-col gap-1.5">
        {manifest.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onSelect(entry.id)}
            className={`text-left px-4 py-3 rounded-xl border transition-all text-sm ${
              activeId === entry.id
                ? "border-violet-500/60 bg-violet-950/40 text-zinc-100"
                : "border-zinc-700/50 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            <span className="font-mono">{entry.text}</span>
            <span className="block text-[11px] text-zinc-600 mt-0.5 font-mono">
              {entry.tokens.length} tokens: {entry.tokens.join(" · ")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Layer / Head selectors ───────────────────────────────────────────────────

function LayerHeadSelector({
  nLayers,
  nHeads,
  layer,
  head,
  onLayerChange,
  onHeadChange,
  corefLayers,
  corefHeads,
}: {
  nLayers: number;
  nHeads: number;
  layer: number;
  head: number;
  onLayerChange: (l: number) => void;
  onHeadChange: (h: number) => void;
  corefLayers: number[];
  corefHeads: number[];
}) {
  return (
    <div className="flex flex-wrap gap-6 items-start">
      {/* Layer selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm font-medium">
            Layer {layer + 1}
          </span>
          <span className="text-zinc-600 text-xs">of {nLayers}</span>
          {corefLayers.includes(layer) && (
            <span className="text-[10px] text-violet-400 border border-violet-500/40 rounded px-1.5 py-0.5">
              coreference zone
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: nLayers }, (_, i) => (
            <button
              key={i}
              onClick={() => onLayerChange(i)}
              title={`Layer ${i + 1}`}
              className={`w-7 h-7 rounded text-xs font-mono transition-colors ${
                i === layer
                  ? "bg-violet-600 text-white"
                  : corefLayers.includes(i)
                  ? "bg-violet-950/60 text-violet-400 border border-violet-700/40 hover:bg-violet-900/60"
                  : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Head selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm font-medium">
            Head {head + 1}
          </span>
          <span className="text-zinc-600 text-xs">of {nHeads}</span>
          {corefHeads.includes(head) && (
            <span className="text-[10px] text-emerald-400 border border-emerald-500/40 rounded px-1.5 py-0.5">
              coreference head
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: nHeads }, (_, i) => (
            <button
              key={i}
              onClick={() => onHeadChange(i)}
              title={`Head ${i + 1}`}
              className={`w-7 h-7 rounded text-xs font-mono transition-colors ${
                i === head
                  ? "bg-emerald-600 text-white"
                  : corefHeads.includes(i)
                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-900/60"
                  : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Head Pattern Guide ───────────────────────────────────────────────────────

function HeadGuide({ layer, head, coref }: {
  layer: number;
  head: number;
  coref: AttentionData["coref"];
}) {
  const isCoref = coref.layers.includes(layer) && coref.heads.includes(head);
  const headMod = head % 4;

  const pattern = isCoref
    ? { name: "Coreference head", desc: "Resolves pronouns to their antecedents — the 'it → animal' moment.", color: "violet" }
    : headMod === 0
    ? { name: "Positional head", desc: "Each token attends to nearby tokens based on distance in the sequence.", color: "blue" }
    : headMod === 1
    ? { name: "Previous-token head", desc: "Attends mainly to the immediately preceding token — like a sliding window.", color: "cyan" }
    : headMod === 2
    ? { name: "First-token sink", desc: "Excess attention 'drains' into the first token — a common artefact in trained transformers.", color: "amber" }
    : { name: "Broad attention", desc: "Distributes attention widely, integrating context from across the sequence.", color: "zinc" };

  const colorMap: Record<string, string> = {
    violet: "text-violet-400 border-violet-500/40 bg-violet-950/30",
    blue: "text-blue-400 border-blue-500/40 bg-blue-950/30",
    cyan: "text-cyan-400 border-cyan-500/40 bg-cyan-950/30",
    amber: "text-amber-400 border-amber-500/40 bg-amber-950/30",
    zinc: "text-zinc-400 border-zinc-600/40 bg-zinc-900",
  };

  return (
    <div className={`flex gap-3 px-4 py-3 rounded-xl border ${colorMap[pattern.color]}`}>
      <div>
        <p className="text-sm font-semibold">{pattern.name}</p>
        <p className="text-xs mt-0.5 opacity-80">{pattern.desc}</p>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function AttentionPanel() {
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [activeId, setActiveId] = useState<string>("classic");
  const [data, setData] = useState<AttentionData | null>(null);
  const [layer, setLayer] = useState(4); // default: middle layer where coref shows
  const [head, setHead] = useState(8);   // default: coref head
  const [loading, setLoading] = useState(true);

  // Load manifest once
  useEffect(() => {
    fetch("/data/attention/manifest.json")
      .then((r) => r.json())
      .then(setManifest);
  }, []);

  // Load sentence data on change
  const loadSentence = useCallback((id: string) => {
    setLoading(true);
    fetch(`/data/attention/${id}.json`)
      .then((r) => r.json())
      .then((d: AttentionData) => {
        setData(d);
        // Auto-jump to the coreference layer/head
        if (d.coref.layers.length && d.coref.heads.length) {
          setLayer(d.coref.layers[0]);
          setHead(d.coref.heads[0]);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadSentence(activeId); }, [activeId, loadSentence]);

  const handleSentenceSelect = (id: string) => {
    setActiveId(id);
  };

  if (!data || loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-600 text-sm gap-3">
        <span className="animate-spin w-4 h-4 border-2 border-zinc-700 border-t-violet-500 rounded-full inline-block" />
        Loading attention data…
      </div>
    );
  }

  const matrix = data.attention[layer][head];
  const highlightCoref =
    data.coref.layers.includes(layer) && data.coref.heads.includes(head)
      ? { from: data.coref.token_from, to: data.coref.token_to }
      : null;

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Attention Heatmap</h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            Layer {layer + 1} · Head {head + 1} · {data.tokens.length} tokens
          </p>
        </div>
        <HeadGuide layer={layer} head={head} coref={data.coref} />
      </div>

      {/* Two-column layout: left = controls, right = heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 items-start">

        {/* Left: sentence + layer/head selectors */}
        <div className="flex flex-col gap-6">
          <SentencePicker
            manifest={manifest}
            activeId={activeId}
            onSelect={handleSentenceSelect}
          />
          <LayerHeadSelector
            nLayers={data.n_layers}
            nHeads={data.n_heads}
            layer={layer}
            head={head}
            onLayerChange={setLayer}
            onHeadChange={setHead}
            corefLayers={data.coref.layers}
            corefHeads={data.coref.heads}
          />

          {/* Insight card */}
          <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-4 text-sm text-zinc-400 leading-relaxed">
            <p className="font-medium text-zinc-300 mb-1">What you're seeing</p>
            <p>
              Each <span className="text-zinc-200">row</span> is a query token. Each{" "}
              <span className="text-zinc-200">column</span> is a key token. Brighter cells mean
              stronger attention.
            </p>
            <p className="mt-2">
              The <span className="text-violet-300">upper triangle is always zero</span> — causal
              masking means each token can only attend to itself and past tokens.
            </p>
            <p className="mt-2">
              Highlighted cells (
              <span className="text-violet-300">purple outline</span>) mark the coreference
              link — try Layers 4–6, Head 9.
            </p>
          </div>
        </div>

        {/* Right: heatmap */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <AttentionHeatmap
            tokens={data.tokens}
            matrix={matrix}
            highlightCoref={highlightCoref}
          />
        </div>
      </div>
    </div>
  );
}
