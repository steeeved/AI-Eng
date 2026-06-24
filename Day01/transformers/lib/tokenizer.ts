/**
 * Tokenizer utilities for the demo panel.
 * Uses gpt-tokenizer which runs fully client-side — no API calls.
 *
 * Supported encodings (from tiktoken / gpt-tokenizer):
 *   - r50k_base  — GPT-2, GPT-3 (davinci)
 *   - p50k_base  — Codex, text-davinci-002/003
 *   - cl100k_base — GPT-3.5 Turbo, GPT-4, GPT-4 Turbo
 *   - o200k_base  — GPT-4o, GPT-4o-mini
 *
 * Note: Anthropic does not publicly release Claude's tokenizer.
 * The @anthropic-ai/tokenizer package is only accurate for pre-Claude 3
 * models. For Claude 3+, there is no way to get accurate token boundaries
 * client-side, so Claude models are not included here.
 */

// We lazy-import encodings so the heavy BPE data is only loaded when needed.

export type ModelKey =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "gpt-4"
  | "gpt-3.5-turbo"
  | "gpt-2";

export type EncodingName = "o200k_base" | "cl100k_base" | "p50k_base" | "r50k_base";

export interface ModelConfig {
  label: string;
  encoding: EncodingName;
  /** USD per input token */
  inputPricePerToken: number;
  /** USD per output token */
  outputPricePerToken: number;
  contextWindow: number;
}

export const MODELS: Record<ModelKey, ModelConfig> = {
  "gpt-4o": {
    label: "GPT-4o",
    encoding: "o200k_base",
    inputPricePerToken: 2.5 / 1_000_000,
    outputPricePerToken: 10 / 1_000_000,
    contextWindow: 128_000,
  },
  "gpt-4o-mini": {
    label: "GPT-4o mini",
    encoding: "o200k_base",
    inputPricePerToken: 0.15 / 1_000_000,
    outputPricePerToken: 0.6 / 1_000_000,
    contextWindow: 128_000,
  },
  "gpt-4-turbo": {
    label: "GPT-4 Turbo",
    encoding: "cl100k_base",
    inputPricePerToken: 10 / 1_000_000,
    outputPricePerToken: 30 / 1_000_000,
    contextWindow: 128_000,
  },
  "gpt-4": {
    label: "GPT-4",
    encoding: "cl100k_base",
    inputPricePerToken: 30 / 1_000_000,
    outputPricePerToken: 60 / 1_000_000,
    contextWindow: 8_192,
  },
  "gpt-3.5-turbo": {
    label: "GPT-3.5 Turbo",
    encoding: "cl100k_base",
    inputPricePerToken: 0.5 / 1_000_000,
    outputPricePerToken: 1.5 / 1_000_000,
    contextWindow: 16_385,
  },
  "gpt-2": {
    label: "GPT-2",
    encoding: "r50k_base",
    inputPricePerToken: 0, // open-weights, free
    outputPricePerToken: 0,
    contextWindow: 1_024,
  },
};

export interface TokenInfo {
  id: number;
  text: string;
  /** byte length of the decoded token */
  bytes: number;
}

/** Dynamically import the right encoding module. */
async function loadEncoding(encoding: EncodingName) {
  // Dynamic imports so the heavy BPE tables aren't bundled into the initial JS.
  // Each encoding is a separate chunk that's only fetched when selected.
  switch (encoding) {
    case "o200k_base": {
      const mod = await import("gpt-tokenizer/encoding/o200k_base");
      return { encode: mod.encode, decode: mod.decode };
    }
    case "cl100k_base": {
      const mod = await import("gpt-tokenizer/encoding/cl100k_base");
      return { encode: mod.encode, decode: mod.decode };
    }
    case "p50k_base": {
      const mod = await import("gpt-tokenizer/encoding/p50k_base");
      return { encode: mod.encode, decode: mod.decode };
    }
    case "r50k_base": {
      const mod = await import("gpt-tokenizer/encoding/r50k_base");
      return { encode: mod.encode, decode: mod.decode };
    }
  }
}

/** Encode text and return structured token info for each token. */
export async function tokenize(
  text: string,
  model: ModelKey
): Promise<TokenInfo[]> {
  if (!text) return [];

  const config = MODELS[model];
  const { encode, decode } = await loadEncoding(config.encoding);
  const ids = encode(text);

  return ids.map((id) => {
    const tokenText = decode([id]);
    return {
      id,
      text: tokenText,
      bytes: new TextEncoder().encode(tokenText).length,
    };
  });
}

/** Approximate USD → KSH exchange rate. */
export const USD_TO_KSH = 129.5;

/** Format USD price with smart precision. */
export function formatCost(usd: number): string {
  if (usd === 0) return "free";
  if (usd < 0.000001) return `$${usd.toExponential(2)}`;
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

/** Format KSH price with smart precision. */
export function formatCostKsh(usd: number): string {
  if (usd === 0) return "free";
  const ksh = usd * USD_TO_KSH;
  if (ksh < 0.0001) return `KSh ${ksh.toExponential(2)}`;
  if (ksh < 1) return `KSh ${ksh.toFixed(4)}`;
  return `KSh ${ksh.toFixed(2)}`;
}

/** Cycle through a palette of visually distinct token colours. */
const TOKEN_PALETTE = [
  { bg: "#3b1f6e", border: "#7c3aed", text: "#c4b5fd" }, // violet
  { bg: "#1e3a5f", border: "#2563eb", text: "#93c5fd" }, // blue
  { bg: "#14412d", border: "#059669", text: "#6ee7b7" }, // emerald
  { bg: "#5c2a0a", border: "#d97706", text: "#fcd34d" }, // amber
  { bg: "#4a1020", border: "#e11d48", text: "#fda4af" }, // rose
  { bg: "#0d3845", border: "#0891b2", text: "#67e8f9" }, // cyan
  { bg: "#4c1d60", border: "#a21caf", text: "#e879f9" }, // fuchsia
  { bg: "#1a3828", border: "#16a34a", text: "#86efac" }, // green
  { bg: "#5c2d0a", border: "#ea580c", text: "#fdba74" }, // orange
  { bg: "#1e3a5f", border: "#0284c7", text: "#7dd3fc" }, // sky
] as const;

export function tokenColor(index: number) {
  return TOKEN_PALETTE[index % TOKEN_PALETTE.length];
}
