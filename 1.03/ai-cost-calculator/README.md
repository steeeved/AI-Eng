# ai-cli-cost-calculator

A CLI that compares token counts and API costs across 7 AI models before you write a single line of integration code.

```bash
npx ai-cli-cost-calculator --text "Summarise this contract" --output-tokens 500
```

---

## Why

Model selection is one of the highest-leverage decisions in an AI system. A wrong call costs 10–75× more per request, or ships latency that kills UX. This tool makes the cost difference visible in seconds.

---

## Usage

```bash
# Table output (default)
npx ai-cli-cost-calculator --text "your prompt here" --output-tokens 500

# Machine-readable JSON (pipeable)
npx ai-cli-cost-calculator --text "your prompt here" --output-tokens 500 --json

# Short flags
npx ai-cli-cost-calculator -t "your prompt here" -o 500 -j
```

### Flags

| Flag | Alias | Required | Description |
|------|-------|----------|-------------|
| `--text` | `-t` | Yes | The prompt text to analyse |
| `--output-tokens` | `-o` | Yes | Expected output length in tokens |
| `--json` | `-j` | No | Dump machine-readable JSON instead of table |

### Environment

Claude token counts require an Anthropic API key. Without one, Claude models fall back to estimated counts (flagged in output).

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY
```

---

## Models Compared

| Model | Tier | Tokenizer |
|-------|------|-----------|
| GPT-5.5 | Frontier | Exact (gpt-tokenizer) |
| Claude Opus 4.8 | Frontier | Exact (Anthropic SDK) |
| Gemini 2.5 Pro | Frontier | Estimated ±10% |
| GPT-4.1 Mini | Mid | Exact (gpt-tokenizer) |
| Claude Sonnet 4.6 | Mid | Exact (Anthropic SDK) |
| Gemini 2.5 Flash | Mid | Estimated ±10% |
| Llama 4 Maverick (Groq) | Cost-efficient | Estimated ±10% |

**Tokenizer accuracy note:**
- OpenAI models use [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer) — exact, runs locally
- Claude models use the Anthropic SDK `messages.countTokens` endpoint — exact, requires API call
- Gemini and Groq use character-count estimation (`chars / 4`) — marked `~±10%` in output

All prices are sourced directly from provider pricing pages (OpenAI, Anthropic, Google AI, Groq). No OpenRouter markup.

---

## Model Selection Flowchart

```
Is the feature user-facing with a response time expectation?
│
├── YES → Is the task complex reasoning or multi-step?
│         │
│         ├── YES → Mid tier (Sonnet / GPT-4.1 Mini / Flash)
│         │         Good quality, <2s latency, fraction of frontier cost
│         │
│         └── NO  → Cost-efficient tier (Llama / Flash)
│                   Fastest, cheapest — fine for simple Q&A, classification
│
└── NO  → Is accuracy critical and volume low?
          │
          ├── YES → Frontier tier (Opus / GPT-5.5 / Gemini Pro)
          │         Maximum quality, cost doesn't dominate at low volume
          │
          └── NO  → Does the same context repeat across many calls?
                    │
                    ├── YES → Check cached input price — often changes the winner.
                    │         Anthropic and OpenAI cache at 75–90% discount.
                    │         Run this tool with your actual system prompt.
                    │
                    └── NO  → Mid tier at scale, cost-efficient at very high volume
```

---

## Business Scenarios

### 1. Legal document summarisation (low volume, high stakes)

A law firm needs to summarise 50 contracts per day. Each contract averages 8,000 input tokens; output is ~400 tokens.

**Choice: Claude Opus 4.8**

At 50 requests/day the frontier cost (~$2/day) is negligible compared to the value of accurate extraction. Claude Opus has the strongest instruction-following on structured legal language, and the long context window handles full contracts without chunking. Cost is not the constraint — quality is.

---

### 2. Customer support ticket classification (high volume, simple task)

A SaaS company classifies 50,000 support tickets per day into 12 categories. Input is ~150 tokens per ticket; output is a single label (~5 tokens).

**Choice: Llama 4 Maverick on Groq**

Classification at this scale is a pattern-matching task, not a reasoning task — mid-tier quality is more than sufficient. Groq's inference speed means sub-200ms responses even at this volume. At $0.50/M input tokens versus $5/M for a frontier model, the annual saving exceeds $50k for the same quality outcome. Spend the difference on evals, not tokens.

---

### 3. RAG pipeline with a fixed system prompt (medium volume, repeated context)

A B2B product runs a RAG assistant with a 3,000-token system prompt sent on every call. Volume is 10,000 calls/day; retrieval adds ~1,500 tokens; output averages 300 tokens.

**Choice: Claude Sonnet 4.6 with prompt caching**

The system prompt repeats identically on every call — exactly the pattern prompt caching is built for. At $0.30/M cached vs $3.00/M base, the 3,000-token system prompt costs 90% less after the first call. At 10,000 calls/day this saves ~$80/day over uncached mid-tier, and over $29,000/year — more than enough to justify Sonnet over a cheaper model with no caching support.

---

## Output Columns

| Column | Description |
|--------|-------------|
| Model | Model display name |
| Tier | frontier / mid / cost-efficient |
| Input Tokens | Token count for your `--text` (exact or estimated) |
| Output Tokens | Your `--output-tokens` value |
| Input Cost | Cost for input tokens at base rate |
| Cached Input Cost | Cost if input hits prompt cache (N/A if unsupported) |
| Output Cost | Cost for output tokens |
| Total Cost | Input + output at base rate |
| Context Window | Max tokens this model accepts |
| Max Output | Max tokens this model can generate |
| Pricing Source | direct-api or openrouter |

---

## Installation (local dev)

```bash
git clone <repo>
cd ai-cli-cost-calculator
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY
node src/cli.js --text "hello" --output-tokens 100
```

---
