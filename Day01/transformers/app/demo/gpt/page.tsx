import type { Metadata } from "next";
import TinyGPTPanel from "@/components/gpt/TinyGPTPanel";

export const metadata: Metadata = {
  title: "Tiny GPT · Transformer Demo",
  description:
    "Watch a character-level language model trained on Shakespeare generate text one character at a time — with temperature control and live probability distributions.",
};

export default function GPTPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-12">
      {/* Page header */}
      <div className="max-w-5xl mx-auto mb-10">
        <nav className="flex items-center gap-2 text-sm text-zinc-600 mb-6">
          <a href="/demo/tokenizer" className="hover:text-zinc-400 transition-colors">
            Transformer Demo
          </a>
          <span>/</span>
          <a href="/demo/embeddings" className="hover:text-zinc-400 transition-colors">
            Embedding Space
          </a>
          <span>/</span>
          <a href="/demo/attention" className="hover:text-zinc-400 transition-colors">
            Attention
          </a>
          <span>/</span>
          <span className="text-zinc-400">Panel 4 — Tiny GPT</span>
        </nav>

        <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">
          Text generation, one character at a time
        </h1>
        <p className="mt-3 text-zinc-400 text-lg max-w-2xl leading-relaxed">
          This is a{" "}
          <span className="text-violet-400 font-medium">character-level language model</span>{" "}
          trained on Shakespeare. At each step it computes a probability
          distribution over the next character, samples one, and feeds it back
          in. This is <em>exactly</em> what GPT-4 does — just at the{" "}
          <span className="text-violet-400 font-medium">token</span> level and
          with transformer layers in between.
        </p>

        {/* Key insight callout */}
        <div className="mt-6 flex gap-3 bg-violet-950/40 border border-violet-800/40 rounded-xl px-5 py-4 max-w-2xl">
          <span className="text-violet-400 text-lg mt-0.5">💡</span>
          <p className="text-zinc-300 text-sm leading-relaxed">
            Move the <span className="text-violet-300 font-medium">temperature</span> slider and
            watch the probability bars change shape in real time.
            Low temperature → one character dominates. High temperature → the
            distribution flattens and the output gets weird. This is why ChatGPT
            has a temperature setting, and why{" "}
            <span className="font-mono text-violet-300">temperature=0</span> is
            used for deterministic outputs.
          </p>
        </div>
      </div>

      {/* Panel */}
      <TinyGPTPanel />

      {/* Footer nav */}
      <div className="max-w-5xl mx-auto mt-16 pt-8 border-t border-zinc-800 flex justify-between items-center text-sm">
        <a
          href="/demo/attention"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Panel 3 — Attention
        </a>
        <span className="text-zinc-600">Panel 4 of 4</span>
        <a
          href="/demo/tokenizer"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Start over from Panel 1
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </main>
  );
}
