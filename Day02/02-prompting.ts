/**
 * Day 02 — Context Engineering Fundamentals
 * Runs 6 prompt variants on the same task and prints a side-by-side comparison.
 * Also runs a lost-in-the-middle haystack test on 30 passages.
 *
 * Usage:
 *   npx ts-node 02-prompting.ts
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY=sk-ant-...
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

// ─── Shared task ───────────────────────────────────────────────────────────────
// Classify a customer review as Positive / Negative / Neutral and give a
// one-sentence reason. We use the same review for all 6 variants so the
// comparison is apples-to-apples.

const REVIEW =
  "The battery lasts forever and the camera is stunning, but the phone " +
  "runs hot during video calls and the price feels steep for what you get.";

// ─── Helper ────────────────────────────────────────────────────────────────────

async function call(
  systemPrompt: string | null,
  userMessage: string,
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: MODEL,
    max_tokens: 256,
    messages,
  };

  if (systemPrompt) {
    params.system = systemPrompt;
  }

  const response = await client.messages.create(params);
  const block: any = response.content[0];
  return block.type === "text" ? block.text.trim() : "[non-text block]";
}

function hr(label: string) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(` ${label}`);
  console.log(line);
}

// ─── Variant 1: Zero-shot ──────────────────────────────────────────────────────

async function zeroShot(): Promise<string> {
  return call(
    null,
    `Classify the following customer review as Positive, Negative, or Neutral. ` +
      `Give a one-sentence reason.\n\nReview: "${REVIEW}"`,
  );
}

// ─── Variant 2: Few-shot (3 examples) ─────────────────────────────────────────

async function fewShot(): Promise<string> {
  const examples = `
Examples:
Review: "Fast shipping and great packaging, exactly what I ordered."
Classification: Positive — The customer highlights logistics and product accuracy positively.

Review: "Stopped working after two days. Complete waste of money."
Classification: Negative — The product failed quickly and the customer felt cheated.

Review: "It's okay. Does what it says, nothing special."
Classification: Neutral — The customer is neither impressed nor disappointed.
`.trim();

  return call(
    null,
    `${examples}\n\nNow classify this review as Positive, Negative, or Neutral with a one-sentence reason.\n\nReview: "${REVIEW}"`,
  );
}

// ─── Variant 3: Chain-of-Thought ──────────────────────────────────────────────

async function chainOfThought(): Promise<string> {
  return call(
    null,
    `Classify the following customer review as Positive, Negative, or Neutral.\n\n` +
      `Review: "${REVIEW}"\n\n` +
      `Think step by step:\n` +
      `1. List the positive aspects mentioned.\n` +
      `2. List the negative aspects mentioned.\n` +
      `3. Weigh them and decide the overall sentiment.\n` +
      `4. State your final classification and a one-sentence reason.`,
  );
}

// ─── Variant 4: Role-conditioned ──────────────────────────────────────────────

async function roleConditioned(): Promise<string> {
  return call(
    `You are a senior product analyst at an e-commerce company. ` +
      `Your job is to classify customer reviews quickly and precisely to feed into our sentiment dashboard. ` +
      `Always respond with: Classification: <label> — <one-sentence reason>.`,
    `Review: "${REVIEW}"`,
  );
}

// ─── Variant 5: Decomposed ────────────────────────────────────────────────────

async function decomposed(): Promise<string> {
  // Step 1: extract pros and cons
  const extraction = await call(
    null,
    `Extract the pros and cons from this review as two bullet lists.\n\nReview: "${REVIEW}"`,
  );

  // Step 2: classify based on the extraction
  const classification = await call(
    null,
    `Given these pros and cons:\n${extraction}\n\n` +
      `Classify the overall sentiment as Positive, Negative, or Neutral and give a one-sentence reason.`,
  );

  return `[Step 1 — Extraction]\n${extraction}\n\n[Step 2 — Classification]\n${classification}`;
}

// ─── Variant 6: JSON-mode ─────────────────────────────────────────────────────

async function jsonMode(): Promise<string> {
  const raw = await call(
    `You are a sentiment classifier. Always respond with valid JSON only — no prose, no markdown fences.`,
    `Classify this review. Return JSON with keys: "label" (Positive | Negative | Neutral), "confidence" (0-1), "reason" (one sentence), "pros" (array of strings), "cons" (array of strings).\n\nReview: "${REVIEW}"`,
  );

  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return `[Raw — JSON parse failed]\n${raw}`;
  }
}

// ─── Lost-in-the-Middle Haystack Test ─────────────────────────────────────────
// We hide a specific fact in one of 30 passages and ask the model to retrieve it.
// We test three positions: early (passage 3), middle (passage 15), late (passage 28).

function buildHaystack(targetPosition: number): string {
  const TARGET_FACT = "The secret launch date is March 7th.";
  const filler = (i: number) =>
    `Passage ${i}: This passage discusses general background about the product roadmap, ` +
    `team structure, and quarterly planning for the upcoming fiscal year. ` +
    `No actionable dates are mentioned here.`;

  const passages: string[] = [];
  for (let i = 1; i <= 30; i++) {
    passages.push(
      i === targetPosition ? `Passage ${i}: ${TARGET_FACT}` : filler(i),
    );
  }
  return passages.join("\n\n");
}

async function haystackTest(position: number): Promise<string> {
  const haystack = buildHaystack(position);
  return call(
    null,
    `Read all 30 passages below and answer: What is the secret launch date?\n\n${haystack}\n\nAnswer:`,
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Day 02 — Context Engineering Experiments");
  console.log(`Model: ${MODEL}`);
  console.log(`Review under test:\n"${REVIEW}"\n`);

  // ── 6 Variants ──────────────────────────────────────────────────────────────

  hr("Variant 1 · Zero-shot");
  console.log(await zeroShot());

  hr("Variant 2 · Few-shot (3 examples)");
  console.log(await fewShot());

  hr("Variant 3 · Chain-of-Thought");
  console.log(await chainOfThought());

  hr("Variant 4 · Role-conditioned");
  console.log(await roleConditioned());

  hr("Variant 5 · Decomposed (2-step)");
  console.log(await decomposed());

  hr("Variant 6 · JSON-mode");
  console.log(await jsonMode());

  // ── Lost-in-the-Middle ──────────────────────────────────────────────────────

  hr("Lost-in-the-Middle · 30-passage haystack");
  console.log("Target fact: 'The secret launch date is March 7th.'\n");

  for (const pos of [3, 15, 28]) {
    const label =
      pos === 3
        ? "EARLY (passage 3)"
        : pos === 15
          ? "MIDDLE (passage 15)"
          : "LATE (passage 28)";
    process.stdout.write(`Position: ${label}\n  → `);
    const answer = await haystackTest(pos);
    console.log(answer.replace(/\n/g, " "));
  }

  console.log(
    "\n✓ Done. Fill in notes/02-prompting.md with your observations.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
