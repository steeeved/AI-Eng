import type { Metadata } from "next";
import AttentionPanel from "@/components/attention/AttentionPanel";

export const metadata: Metadata = {
  title: "Attention Heatmap · Transformer Demo",
  description:
    "Watch how each token attends to every other token — the mechanism that lets transformers resolve pronouns, track subjects, and understand context.",
};

export default function AttentionPage() {
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
          <span className="text-zinc-400">Panel 3 — Attention</span>
        </nav>

        <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">
          What is the model looking at?
        </h1>
        <p className="mt-3 text-zinc-400 text-lg max-w-2xl leading-relaxed">
          Self-attention lets every token{" "}
          <span className="text-violet-400 font-medium">query</span> every other token and
          decide how much to{" "}
          <span className="text-violet-400 font-medium">attend</span> to it. A transformer
          has 12 layers × 12 heads — each head learns a different relationship.
        </p>

        {/* Key insight callout */}
        <div className="mt-6 flex gap-3 bg-violet-950/40 border border-violet-800/40 rounded-xl px-5 py-4 max-w-2xl">
          <span className="text-violet-400 text-lg mt-0.5">💡</span>
          <p className="text-zinc-300 text-sm leading-relaxed">
            In the sentence{" "}
            <em className="text-zinc-200">
              "The animal didn't cross the street because{" "}
              <span className="text-violet-300 font-semibold">it</span> was too tired"
            </em>
            , look at Layer 5, Head 9. The token{" "}
            <span className="font-mono text-violet-300">it</span> attends strongly to{" "}
            <span className="font-mono text-violet-300">animal</span> — the model has
            resolved the pronoun through geometry alone.
          </p>
        </div>
      </div>

      {/* Panel */}
      <AttentionPanel />

      {/* Footer nav */}
      <div className="max-w-5xl mx-auto mt-16 pt-8 border-t border-zinc-800 flex justify-between items-center text-sm">
        <a
          href="/demo/embeddings"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Panel 2 — Embedding Space
        </a>
        <span className="text-zinc-600">Panel 3 of 4</span>
        <a
          href="/demo/gpt"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Panel 4 — Tiny GPT
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </main>
  );
}
