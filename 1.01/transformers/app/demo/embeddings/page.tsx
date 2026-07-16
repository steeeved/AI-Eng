import type { Metadata } from "next";
import EmbeddingPanel from "@/components/embeddings/EmbeddingPanel";

export const metadata: Metadata = {
  title: "Embedding Space · Transformer Demo",
  description:
    "Explore how GPT represents words as vectors in a high-dimensional space — projected to 2D so you can see semantic relationships, analogies, and clusters.",
};

export default function EmbeddingsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-12">
      {/* Page header */}
      <div className="max-w-5xl mx-auto mb-10">
        <nav className="flex items-center gap-2 text-sm text-zinc-600 mb-6">
          <a href="/demo/tokenizer" className="hover:text-zinc-400 transition-colors">
            Transformer Demo
          </a>
          <span>/</span>
          <span className="text-zinc-400">Panel 2 — Embedding Space</span>
        </nav>

        <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">
          Words as points in space
        </h1>
        <p className="mt-3 text-zinc-400 text-lg max-w-2xl leading-relaxed">
          After tokenization, each token is mapped to a{" "}
          <span className="text-violet-400 font-medium">vector</span> — a list of
          ~12,000 numbers. Similar words end up near each other. Relationships
          become{" "}
          <span className="text-violet-400 font-medium">geometry</span>:{" "}
          king&nbsp;−&nbsp;man&nbsp;+&nbsp;woman&nbsp;≈&nbsp;queen.
        </p>

        {/* Key insight callout */}
        <div className="mt-6 flex gap-3 bg-violet-950/40 border border-violet-800/40 rounded-xl px-5 py-4 max-w-2xl">
          <span className="text-violet-400 text-lg mt-0.5">💡</span>
          <p className="text-zinc-300 text-sm leading-relaxed">
            This plot shows{" "}
            <span className="font-mono text-violet-300">80 words</span> reduced
            from high-dimensional vectors to 2D via PCA — enough to reveal
            clusters and analogy geometry. The model never saw these categories;
            it inferred them from co-occurrence patterns in text.
          </p>
        </div>
      </div>

      {/* Panel */}
      <EmbeddingPanel />

      {/* Footer nav */}
      <div className="max-w-5xl mx-auto mt-16 pt-8 border-t border-zinc-800 flex justify-between items-center text-sm">
        <a
          href="/demo/tokenizer"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Panel 1 — Tokenizer
        </a>
        <span className="text-zinc-600">Panel 2 of 4</span>
        <a
          href="/demo/attention"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Panel 3 — Attention
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </main>
  );
}
