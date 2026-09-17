/**
 * 1.05 — Structured output as a control surface.
 *
 * `extractStandup(text)` turns a messy standup dump into a validated StandupDump.
 *
 * Mechanism: the Zod schema is exported to JSON Schema and handed to the model as a
 * forced tool call (`tool_choice: {type: "tool"}`). The provider constrains decoding to
 * that schema, so the *shape* is enforced at the token level — the model cannot emit a
 * missing field or an out-of-enum value. Zod then re-validates at runtime, because
 * "shape is guaranteed" is a claim about the API, not something your code should trust.
 *
 * The retry loop is the FALLBACK path (1.05's third objective): when validation fails
 * anyway — a refusal, a provider without constrained decoding, a semantic constraint the
 * schema can't express — the Zod error is fed back as a fix-this message.
 *
 * `today` is pinned explicitly rather than read from the clock so that relative deadlines
 * ("fri", "next week") resolve to the same ISO date on every run. An extractor that reads
 * Date.now() cannot be evaluated: every case would drift by the day you ran it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { StandupDump } from "./structured_output";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MODEL = process.env.EXTRACTOR_MODEL ?? "claude-haiku-4-5-20251001";

const TOOL_NAME = "record_standup";

/** Zod -> JSON Schema. One source of truth; no hand-written schema to drift. */
function toolSchema() {
  const s = z.toJSONSchema(StandupDump, { target: "draft-7" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

function systemPrompt(today: string): string {
  return [
    "You extract structured records from raw standup notes.",
    "",
    `Today is ${today} (ISO 8601). Resolve every relative deadline against that date.`,
    "- `deadline` keeps the wording as stated ('fri', 'next week', 'eod').",
    "- `dueDate` is that same deadline as a YYYY-MM-DD calendar date, or null if none is stated.",
    "- Never invent a dueDate for a task with no stated deadline.",
    "",
    "Extract only what the text supports. If a field is not stated, use null — do not guess.",
    "Assign sequential ids T-001, T-002, ... in order of first mention.",
  ].join("\n");
}

export interface ExtractOptions {
  /** ISO date the relative deadlines resolve against. Pin this in tests. */
  today?: string;
  /** Total attempts including the first. 1 disables the retry fallback. */
  maxAttempts?: number;
  model?: string;
}

export interface ExtractResult {
  data: z.infer<typeof StandupDump>;
  /** How many model calls it took. >1 means constrained decoding did not hold. */
  attempts: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export async function extractStandup(
  text: string,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  const { today = new Date().toISOString().slice(0, 10), maxAttempts = 3, model = MODEL } = opts;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: text }];
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt(today),
      tools: [
        {
          name: TOOL_NAME,
          description: "Record every task and decision found in the standup notes.",
          input_schema: toolSchema() as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages,
    });

    usage.promptTokens += res.usage.input_tokens;
    usage.completionTokens += res.usage.output_tokens;
    usage.totalTokens += res.usage.input_tokens + res.usage.output_tokens;

    const block = res.content.find((b) => b.type === "tool_use");

    if (block?.type === "tool_use") {
      const parsed = StandupDump.safeParse(block.input);
      if (parsed.success) return { data: parsed.data, attempts: attempt, usage };
      lastError = z.prettifyError(parsed.error);
    } else {
      lastError = "Model returned no tool_use block (refusal or stop before tool call).";
    }

    // Fallback path: hand the validation error back and ask for a corrected call.
    messages.push(
      { role: "assistant", content: res.content },
      {
        role: "user",
        content:
          `That ${TOOL_NAME} call failed schema validation:\n\n${lastError}\n\n` +
          "Call the tool again with those problems fixed. Change nothing else.",
      },
    );
  }

  throw new Error(
    `extractStandup: schema validation failed after ${maxAttempts} attempts.\n${lastError}`,
  );
}

/** Convenience wrapper when you only want the record. */
export async function extract(text: string, opts: ExtractOptions = {}) {
  return (await extractStandup(text, opts)).data;
}
