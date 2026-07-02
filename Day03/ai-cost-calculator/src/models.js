/**
 * Model registry — pricing and metadata for each model.
 *
 * All prices are in USD per 1,000,000 tokens (per-million).
 * Sources: direct API pricing pages (OpenAI, Anthropic, Google, Groq).
 * Note any OpenRouter models separately with the ~10% markup flagged.
 *
 * TODO: Fill in the actual prices from the pricing pages listed in your Linear issue.
 * Tip: Check https://openai.com/api/pricing, https://www.anthropic.com/pricing#api,
 *      https://ai.google.dev/pricing, https://groq.com/pricing/
 *
 * Structure per model:
 *   id          — short identifier used in output
 *   name        — display name
 *   tier        — "frontier" | "mid" | "cost-efficient"
 *   provider    — "openai" | "anthropic" | "google" | "groq"
 *   tokenizerType — "gpt" | "claude" | "estimated"
 *   inputPricePer1M  — USD per 1M input tokens (base)
 *   outputPricePer1M — USD per 1M output tokens
 *   cachedInputPricePer1M — USD per 1M cached input tokens (null if not supported)
 *   contextWindow   — max input tokens
 *   maxOutputTokens — max output tokens
 *   pricingSource   — "direct-api" | "openrouter"
 */

export const MODELS = [
  // --- FRONTIER ---
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    tier: "frontier",
    provider: "openai",
    tokenizerType: "gpt",
    inputPricePer1M: 5.00,       // Verified via OpenAI Pricing
    outputPricePer1M: 30.00,     // Verified via OpenAI Pricing
    cachedInputPricePer1M: 2.50, // 50% discount on cache hits
    contextWindow: 1100000,      // 1.1M total context window
    maxOutputTokens: 128000,     
    pricingSource: "direct-api",
  },
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    tier: "frontier",
    provider: "anthropic",
    tokenizerType: "claude",
    inputPricePer1M: 5.00,       // Verified via Anthropic Pricing
    outputPricePer1M: 25.00,     // Verified via Anthropic Pricing
    cachedInputPricePer1M: 0.50, // Best rate ($0.50/M for reads/hits)
    contextWindow: 1000000,      // 1M token context (API Beta)
    maxOutputTokens: 8192,       // Current default output limit
    pricingSource: "direct-api",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    tier: "frontier",
    provider: "google",
    tokenizerType: "estimated",
    inputPricePer1M: 1.25,       // Verified via Google Developer Pricing
    outputPricePer1M: 10.00,     // Verified via Google Developer Pricing
    cachedInputPricePer1M: 0.3125, // 75% prompt caching discount
    contextWindow: 1000000,      // 1M standard context window
    maxOutputTokens: 66000,      
    pricingSource: "direct-api",
  },

  // --- MID-TIER ---
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    tier: "mid",
    provider: "openai",
    tokenizerType: "gpt",
    inputPricePer1M: 0.40,       // Verified via TypingMind/Azure Pricing
    outputPricePer1M: 1.60,      // Verified via TypingMind/Azure Pricing
    cachedInputPricePer1M: 0.10, // 75% prompt caching discount
    contextWindow: 1047576,      
    maxOutputTokens: 65536,      
    pricingSource: "direct-api",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    tier: "mid",
    provider: "anthropic",
    tokenizerType: "claude",
    inputPricePer1M: 3.00,       // Verified via Anthropic Pricing
    outputPricePer1M: 15.00,     // Verified via Anthropic Pricing
    cachedInputPricePer1M: 0.30, // $0.30/M on cache hits
    contextWindow: 1000000,      // 1M token context (API Beta)
    maxOutputTokens: 8192,       
    pricingSource: "direct-api",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    tier: "mid",
    provider: "google",
    tokenizerType: "estimated",
    inputPricePer1M: 0.30,       // Verified via Google Developer Pricing
    outputPricePer1M: 2.50,      // Verified via Google Developer Pricing
    cachedInputPricePer1M: 0.075, // 75% prompt caching discount
    contextWindow: 1000000,      
    maxOutputTokens: 32768,      
    pricingSource: "direct-api",
  },

  // --- COST-EFFICIENT ---
  {
    id: "llama-4-maverick",
    name: "Llama 4 Maverick (Groq)",
    tier: "cost-efficient",
    provider: "groq",
    tokenizerType: "estimated",
    inputPricePer1M: 0.50,       // Verified via Groq On-Demand Pricing
    outputPricePer1M: 0.77,      // Verified via Groq On-Demand Pricing
    cachedInputPricePer1M: null, // Groq supports caching on select models only
    contextWindow: 128000,       
    maxOutputTokens: 8192,       
    pricingSource: "direct-api",
  },
];
