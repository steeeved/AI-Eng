'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Model types ─────────────────────────────────────────────────────────────
interface ModelData {
  v: string[];   // vocab: list of chars in order
  b: number[][]; // bigram log-probs: b[prev_char_idx][next_char_idx]
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

/** Temperature-scaled softmax over log-probs */
function softmax(logits: number[], temperature: number): number[] {
  const scaled = logits.map((l) => l / Math.max(temperature, 0.01));
  const maxL = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - maxL));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Multinomial sample from a probability array */
function sampleFromProbs(probs: number[]): number {
  let r = Math.random();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  return probs.length - 1;
}

/** Top-k entries by value, descending */
function topK(probs: number[], vocab: string[], k: number) {
  return probs
    .map((p, i) => ({ char: vocab[i], prob: p }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, k);
}

// ─── Probability bar component ────────────────────────────────────────────────
function ProbBar({
  char,
  prob,
  max,
  sampled,
}: {
  char: string;
  prob: number;
  max: number;
  sampled: boolean;
}) {
  const pct = max > 0 ? (prob / max) * 100 : 0;
  const displayChar = char === '\n' ? '↵' : char === ' ' ? '·' : char;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`font-mono w-5 text-center shrink-0 ${
          sampled ? 'text-emerald-400 font-bold' : 'text-zinc-400'
        }`}
      >
        {displayChar}
      </span>
      <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all duration-200 ${
            sampled ? 'bg-emerald-500' : 'bg-violet-700/60'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`w-12 text-right tabular-nums shrink-0 ${
          sampled ? 'text-emerald-400' : 'text-zinc-500'
        }`}
      >
        {(prob * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function TinyGPTPanel() {
  const [model, setModel] = useState<ModelData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Controls
  const [seed, setSeed] = useState('To be');
  const [temperature, setTemperature] = useState(0.8);
  const [speed, setSpeed] = useState(80); // ms per char

  // Generation state
  const [generated, setGenerated] = useState('');
  const [running, setRunning] = useState(false);
  const [topProbs, setTopProbs] = useState<{ char: string; prob: number }[]>([]);
  const [lastSampled, setLastSampled] = useState<string | null>(null);
  const [stepCount, setStepCount] = useState(0);

  const stopRef = useRef(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // ── Load model ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/shakespeare-model.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ModelData>;
      })
      .then((data) => setModel(data))
      .catch((e) => setLoadError(String(e)));
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [generated]);

  // ── Generate ──────────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!model || running) return;
    stopRef.current = false;
    setRunning(true);
    setGenerated('');
    setTopProbs([]);
    setLastSampled(null);
    setStepCount(0);

    const { v, b } = model;
    const stoi: Record<string, number> = {};
    v.forEach((c, i) => { stoi[c] = i; });

    // Build context from seed — use last known char
    const seedChars = seed.split('').filter((c) => stoi[c] !== undefined);
    let prevIdx = seedChars.length > 0 ? stoi[seedChars[seedChars.length - 1]] : 0;

    let text = seed;
    setGenerated(text);

    const MAX_CHARS = 400;
    let count = 0;

    while (!stopRef.current && count < MAX_CHARS) {
      // Forward pass: look up bigram row, apply temperature softmax
      const logits = b[prevIdx];
      const probs = softmax(logits, temperature);

      // Pick top-10 for display
      const top10 = topK(probs, v, 10);

      // Sample next character
      const nextIdx = sampleFromProbs(probs);
      const nextChar = v[nextIdx];

      setTopProbs(top10);
      setLastSampled(nextChar);
      setStepCount((s) => s + 1);

      // Append to output
      text += nextChar;
      setGenerated(text);

      prevIdx = nextIdx;
      count++;

      await new Promise((r) => setTimeout(r, speed));
    }

    setRunning(false);
  }, [model, seed, temperature, speed, running]);

  const stop = () => {
    stopRef.current = true;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto bg-zinc-900 border border-red-800/40 rounded-2xl p-8 text-center">
        <p className="text-red-400 font-mono text-sm">Failed to load model: {loadError}</p>
        <p className="text-zinc-500 text-xs mt-2">Make sure public/shakespeare-model.json exists.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* ── Top row: controls + output ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">

        {/* ── Controls panel ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Controls
          </h3>

          {/* Seed */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium">Seed text</label>
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={running}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 font-mono text-sm focus:outline-none focus:border-violet-600 disabled:opacity-50"
              placeholder="To be"
              maxLength={64}
            />
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs text-zinc-500 font-medium">Temperature</label>
              <span className="text-xs font-mono text-violet-400">{temperature.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              disabled={running}
              className="w-full accent-violet-500 disabled:opacity-50"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>0.1 — Predictable</span>
              <span>2.0 — Wild</span>
            </div>
            {/* Temperature intuition */}
            <p className="text-[11px] text-zinc-600 leading-relaxed pt-1">
              {temperature < 0.5
                ? 'Low temp → very peaked distribution. The model always picks the most likely next char.'
                : temperature > 1.4
                ? 'High temp → flat distribution. Every char is nearly equally likely — chaos.'
                : 'Mid temp → balanced. Some creativity, some structure.'}
            </p>
          </div>

          {/* Speed */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs text-zinc-500 font-medium">Speed</label>
              <span className="text-xs font-mono text-zinc-400">
                {speed < 40 ? 'Fast' : speed < 100 ? 'Normal' : 'Slow'}
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="200"
              step="10"
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value))}
              disabled={running}
              className="w-full accent-zinc-500 disabled:opacity-50"
            />
          </div>

          {/* Generate / Stop */}
          {!running ? (
            <button
              onClick={generate}
              disabled={!model}
              className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {!model ? 'Loading model…' : 'Generate ▶'}
            </button>
          ) : (
            <button
              onClick={stop}
              className="w-full py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white font-semibold text-sm transition-colors"
            >
              Stop ■
            </button>
          )}

          {/* Step counter */}
          {stepCount > 0 && (
            <p className="text-[11px] text-center text-zinc-600">
              {stepCount} forward passes · {running ? 'running…' : 'done'}
            </p>
          )}
        </div>

        {/* ── Generated text output ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Generated text
            </h3>
            {generated && !running && (
              <button
                onClick={() => { setGenerated(''); setTopProbs([]); setStepCount(0); setLastSampled(null); }}
                className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div
            ref={outputRef}
            className="flex-1 min-h-[200px] max-h-[300px] overflow-y-auto bg-zinc-950 rounded-xl p-4 font-mono text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap"
          >
            {generated ? (
              <>
                {generated}
                {running && (
                  <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </>
            ) : (
              <span className="text-zinc-700">
                {model ? 'Click Generate to start…' : 'Loading model…'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Probability distribution ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Next-token probability distribution
            </h3>
            <p className="text-xs text-zinc-600 mt-1">
              After each character, the model computes probabilities over all {model?.v.length ?? '…'} characters.
              Temperature squashes or sharpens this distribution before sampling.
              {lastSampled && (
                <span className="text-emerald-500">
                  {' '}Sampled: <span className="font-mono font-bold">
                    {lastSampled === '\n' ? '↵' : lastSampled === ' ' ? '·' : lastSampled}
                  </span>
                </span>
              )}
            </p>
          </div>
          {/* Visual temperature indicator */}
          <div className="shrink-0 ml-4 text-right">
            <div className="text-[10px] text-zinc-600 mb-1">softmax temp</div>
            <div
              className="text-lg font-mono font-bold"
              style={{
                color: `hsl(${Math.round(260 - (temperature - 0.1) * 80)}, 70%, 65%)`,
              }}
            >
              τ={temperature.toFixed(2)}
            </div>
          </div>
        </div>

        {topProbs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {topProbs.map(({ char, prob }, i) => (
              <ProbBar
                key={i}
                char={char}
                prob={prob}
                max={topProbs[0].prob}
                sampled={char === lastSampled}
              />
            ))}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-zinc-700 text-sm">
            Distribution appears here during generation
          </div>
        )}
      </div>

      {/* ── Architecture explainer ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
          What&apos;s actually happening — and how GPT-4 scales this up
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Step 1 */}
          <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/60">
            <div className="text-2xl mb-2">1️⃣</div>
            <div className="text-xs font-semibold text-violet-400 mb-1 uppercase tracking-wide">
              Embedding lookup
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The current character is converted to its index, then used to look up a row in the
              <span className="font-mono text-zinc-300"> embedding matrix</span> — a learned vector
              that encodes its &quot;meaning.&quot; In this demo: a 56-element one-hot.
              In GPT-4: a 12,288-dimensional float vector.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/60">
            <div className="text-2xl mb-2">2️⃣</div>
            <div className="text-xs font-semibold text-violet-400 mb-1 uppercase tracking-wide">
              Transformer layers
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              A real GPT runs the embedding through N transformer blocks, each with
              <span className="font-mono text-zinc-300"> self-attention</span> (Panel 3) and an MLP.
              This demo skips those layers and goes directly to the unembedding — making it a bigram
              model. Same math, much smaller scale.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/60">
            <div className="text-2xl mb-2">3️⃣</div>
            <div className="text-xs font-semibold text-violet-400 mb-1 uppercase tracking-wide">
              Softmax → Sample
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The final layer emits raw
              <span className="font-mono text-zinc-300"> logits</span> — one per vocabulary token.
              Softmax (with temperature τ) turns those into probabilities. One token is sampled.
              That token is fed back in as input. Repeat. This is
              <span className="font-mono text-zinc-300"> autoregressive generation</span>.
            </p>
          </div>
        </div>

        {/* Karpathy callout */}
        <div className="mt-4 flex gap-3 bg-violet-950/30 border border-violet-800/30 rounded-xl px-4 py-3">
          <span className="text-violet-400 mt-0.5 shrink-0">🎓</span>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Andrej Karpathy&apos;s <em>nanoGPT</em> builds this exact architecture from scratch in Python — starting
            from a bigram model like this one, then adding positional encodings, multi-head attention, residual
            streams, and layer norms step by step until it generates readable Shakespeare. The video is{' '}
            <span className="text-violet-300">2 hours long</span> and every minute is worth it.
          </p>
        </div>
      </div>
    </div>
  );
}
