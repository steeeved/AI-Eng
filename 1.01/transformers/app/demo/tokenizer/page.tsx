import type { Metadata } from "next";
import TokenizerPanel from "@/components/tokenizer/TokenizerPanel";

export const metadata: Metadata = {
  title: "Tokenizer · Transformer Demo",
  description:
    "See how GPT-4o, GPT-3.5, and GPT-2 tokenize your text — live, in the browser.",
};

export default function TokenizerPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-12">
      {/* Page header */}
      <div className="max-w-5xl mx-auto mb-10">
        <nav className="flex items-center gap-2 text-sm text-zinc-600 mb-6">
          <span>Transformer Demo</span>
          <span>/</span>
          <span className="text-zinc-400">Panel 1 — Tokenizer</span>
        </nav>

        <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">
          How does a GPT see your text?
        </h1>
        <p className="mt-3 text-zinc-400 text-lg max-w-2xl leading-relaxed">
          Before a transformer reads a single word, it breaks your text into{" "}
          <span className="text-violet-400 font-medium">tokens</span> — small
          chunks that may be words, parts of words, or punctuation. Each token
          maps to a number in the model&apos;s vocabulary.
        </p>

        {/* Key insight callout */}
        <div className="mt-6 flex gap-3 bg-violet-950/40 border border-violet-800/40 rounded-xl px-5 py-4 max-w-2xl">
          <span className="text-violet-400 text-lg mt-0.5">💡</span>
          <p className="text-zinc-300 text-sm leading-relaxed">
            The word <em>"tokenization"</em> costs{" "}
            <span className="font-mono text-violet-300">4 tokens</span> (to·ken·ization). The word{" "}
            <em>"dog"</em> costs{" "}
            <span className="font-mono text-violet-300">1</span>. Longer or rarer
            words cost more — and so does your API bill.
          </p>
        </div>
      </div>

      {/* Panel */}
      <TokenizerPanel />

      {/* Footer nav */}
      <div className="max-w-5xl mx-auto mt-16 pt-8 border-t border-zinc-800 flex justify-between items-center text-sm">
        <span className="text-zinc-600">Panel 1 of 4</span>
        <a
          href="/demo/embeddings"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Panel 2 — Embedding Space
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </main>
  );
}
