"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { tokenize, formatCost, formatCostKsh, tokenColor, MODELS, type ModelKey, type TokenInfo } from "@/lib/tokenizer";

// ─── Token Chip ────────────────────────────────────────────────────────────

function TokenChip({
  token,
  index,
}: {
  token: TokenInfo;
  index: number;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const color = tokenColor(index);

  // Render whitespace/newlines visibly
  const display = token.text
    .replace(/ /g, "·")
    .replace(/\n/g, "↵\n")
    .replace(/\t/g, "→");

  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          backgroundColor: color.bg,
          borderColor: color.border,
          color: color.text,
        }}
        className="inline-block border rounded px-1.5 py-0.5 text-sm font-mono cursor-default mx-0.5 my-0.5 transition-all duration-100 hover:brightness-125 whitespace-pre"
      >
        {display || <span className="opacity-40 text-xs">∅</span>}
      </span>

      {showTooltip && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 pointer-events-none">
          <span className="flex flex-col items-center gap-0.5 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
            <span className="text-zinc-300 text-xs font-mono">
              ID: <span className="text-white font-bold">{token.id}</span>
            </span>
            <span className="text-zinc-400 text-[10px]">
              {token.bytes} byte{token.bytes !== 1 ? "s" : ""}
            </span>
          </span>
          {/* arrow */}
          <span className="block w-2 h-2 bg-zinc-800 border-r border-b border-zinc-600 rotate-45 mx-auto -mt-1" />
        </span>
      )}
    </span>
  );
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────

function StatsBar({
  tokens,
  model,
  charCount,
}: {
  tokens: TokenInfo[];
  model: ModelKey;
  charCount: number;
}) {
  const config = MODELS[model];
  const tokenCount = tokens.length;
  const inputCost = tokenCount * config.inputPricePerToken;
  const contextPct = tokenCount > 0
    ? ((tokenCount / config.contextWindow) * 100).toFixed(2)
    : "0";

  const stats = [
    { label: "Characters", value: charCount.toLocaleString() },
    { label: "Tokens", value: tokenCount.toLocaleString(), highlight: true },
    { label: "Chars / token", value: tokenCount > 0 ? (charCount / tokenCount).toFixed(2) : "—" },
    { label: "Input cost", value: formatCost(inputCost), sub: formatCostKsh(inputCost) },
    {
      label: "Context used",
      value: `${contextPct}%`,
      sub: `of ${config.contextWindow.toLocaleString()}`,
    },
  ];

  return (
    <div className="flex flex-wrap gap-px mt-4 rounded-xl overflow-hidden border border-zinc-700/50">
      {stats.map((s, i) => (
        <div
          key={i}
          className="flex-1 min-w-[120px] bg-zinc-900 px-4 py-3 flex flex-col gap-0.5"
        >
          <span className="text-zinc-500 text-[11px] uppercase tracking-wider font-medium">
            {s.label}
          </span>
          <span
            className={`font-mono font-bold text-lg leading-tight ${
              s.highlight ? "text-violet-400" : "text-zinc-100"
            }`}
          >
            {s.value}
          </span>
          {s.sub && (
            <span className="text-zinc-600 text-[10px] font-mono">{s.sub}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Model Selector ─────────────────────────────────────────────────────────

function ModelSelector({
  value,
  onChange,
}: {
  value: ModelKey;
  onChange: (m: ModelKey) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 text-sm">Model</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ModelKey)}
        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer"
      >
        {(Object.keys(MODELS) as ModelKey[]).map((key) => (
          <option key={key} value={key}>
            {MODELS[key].label} ({MODELS[key].encoding})
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ tokens }: { tokens: TokenInfo[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const payload = tokens.map((t) => ({ id: t.id, text: t.text }));
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      disabled={tokens.length === 0}
      className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-violet-500 hover:text-violet-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-400">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy JSON
        </>
      )}
    </button>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

const PLACEHOLDER = `The animal didn't cross the street because it was too tired.

Paste any text here — or try some code, emoji, or a foreign language to see how the tokenizer handles it.`;

const DEFAULT_TEXT = `To date, the cleverest thinker of all time was`;

export default function TokenizerPanel() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [model, setModel] = useState<ModelKey>("gpt-4o");
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runTokenize = useCallback(
    async (inputText: string, inputModel: ModelKey) => {
      setLoading(true);
      try {
        const result = await tokenize(inputText, inputModel);
        setTokens(result);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runTokenize(text, model);
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, model, runTokenize]);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">
            Tokenizer
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            Hover any chip to see its token ID · switch model to compare tokenization
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModelSelector value={model} onChange={setModel} />
          <CopyButton tokens={tokens} />
        </div>
      </div>

      {/* Textarea */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={5}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 font-mono text-sm resize-y focus:outline-none focus:border-violet-500 transition-colors placeholder:text-zinc-600"
          spellCheck={false}
        />
        {text && (
          <button
            onClick={() => setText("")}
            className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 transition-colors"
            aria-label="Clear"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Token chips area */}
      <div className="min-h-[80px] bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <span className="animate-spin inline-block w-3 h-3 border-2 border-zinc-600 border-t-violet-500 rounded-full" />
            Tokenizing…
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-zinc-600 text-sm">
            {text ? "No tokens" : "Start typing above…"}
          </p>
        ) : (
          <div className="flex flex-wrap">
            {tokens.map((token, i) => (
              <TokenChip key={i} token={token} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <StatsBar tokens={tokens} model={model} charCount={text.length} />

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-zinc-600">
        <span>· = space</span>
        <span>↵ = newline</span>
        <span>→ = tab</span>
        <span>∅ = empty token</span>
        <span className="ml-auto">
          Encoding:{" "}
          <span className="text-zinc-500 font-mono">
            {MODELS[model].encoding}
          </span>
        </span>
      </div>
    </div>
  );
}
