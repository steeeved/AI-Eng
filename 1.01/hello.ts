/**
 * Day 01 — hello.ts
 * One LLM call, full diagnostics printed to stdout, LangSmith trace wired.
 *
 * Run:  pnpm tsx hello.ts
 *
 * Required env vars (.env.local — never commit):
 *   ANTHROPIC_API_KEY
 *   LANGSMITH_API_KEY
 *   LANGSMITH_PROJECT=ai-60
 *   LANGCHAIN_TRACING_V2=true
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import Anthropic from "@anthropic-ai/sdk";
import { wrapAnthropic } from "langsmith/wrappers/anthropic";
import { traceable } from "langsmith/traceable";

// ---------------------------------------------------------------------------
// Cost constants (USD per 1 000 tokens) — update when Anthropic changes pricing
// ---------------------------------------------------------------------------
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.0008, output: 0.004 },
  "claude-sonnet-4-5-20251015": { input: 0.003, output: 0.015 },
  "claude-opus-4-5": { input: 0.015, output: 0.075 },
};

function calcCost(model: string, tokensIn: number, tokensOut: number): string {
  const prices = PRICING[model];
  if (!prices) return "unknown (model not in pricing table)";
  const usd =
    (tokensIn / 1000) * prices.input + (tokensOut / 1000) * prices.output;
  return `$${usd.toFixed(6)}`;
}

// ---------------------------------------------------------------------------
// Main call — wrapped so LangSmith captures the full trace
// ---------------------------------------------------------------------------
const run = traceable(
  async () => {
    const model = "claude-haiku-4-5-20251001";
    const temperature = 0;

    const client = wrapAnthropic(new Anthropic());

    const response = await client.messages.create({
      model,
      temperature,
      max_tokens: 256,
      system: "You are a concise assistant. Reply in one sentence.",
      messages: [
        {
          role: "user",
          content:
            "Explain the most important AI SKILLS to learn and practice for the next half a decade to a Javascript Developer.",
        },
      ],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const finishReason = response.stop_reason;
    const output =
      response.content[0].type === "text" ? response.content[0].text : "";

    return { model, temperature, finishReason, tokensIn, tokensOut, output };
  },
  { name: "hello-ts", project_name: process.env.LANGSMITH_PROJECT ?? "AI-60" },
);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
(async () => {
  const result = await run();

  const project = process.env.LANGSMITH_PROJECT ?? "AI-60";
  const traceUrl = `https://apac.smith.langchain.com/projects/${encodeURIComponent(project)}`;

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Day 01 · hello.ts diagnostics");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  model        : ${result.model}`);
  console.log(`  temperature  : ${result.temperature}`);
  console.log(`  finish reason: ${result.finishReason}`);
  console.log(`  tokens in    : ${result.tokensIn}`);
  console.log(`  tokens out   : ${result.tokensOut}`);
  console.log(
    `  USD cost     : ${calcCost(result.model, result.tokensIn, result.tokensOut)}`,
  );
  console.log(`  LangSmith    : ${traceUrl}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("  Response:");
  console.log(`  ${result.output}`);
  console.log("");
})();
