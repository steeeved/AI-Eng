#!/usr/bin/env node
/**
 * cli.js — entry point
 *
 * Usage:
 *   npx ai-cli-cost-calculator --text "your prompt here" --output-tokens 500
 *   npx ai-cli-cost-calculator --text "your prompt here" --output-tokens 500 --json
 *
 * TODO: Wire everything together.
 *
 * Steps:
 *   1. Parse args with minimist (--text, --output-tokens, --json)
 *   2. Validate: --text and --output-tokens are required; exit with a helpful
 *      error message if missing
 *   3. For each model in MODELS:
 *        a. Call countTokens(text, model)     → { count, estimated }
 *        b. Call calculateCost(count, outputTokens, model) → costs
 *        c. Collect into a results array
 *   4. If --json flag: call renderJson(results)
 *      Else: call renderTable(results, outputTokens)
 *
 * Hint: countTokens is async, so use Promise.all to run all models in parallel.
 */

import "dotenv/config";
import minimist from "minimist";
import { MODELS } from "./models.js";
import { countTokens } from "./tokenizer.js";
import { calculateCost } from "./calculator.js";
import { renderTable, renderJson } from "./display.js";

const args = minimist(process.argv.slice(2), {
  string: ["text"],
  number: ["output-tokens"],
  boolean: ["json"],
  alias: { t: "text", o: "output-tokens", j: "json" },
});

async function main() {
  if (!args.text || !args["output-tokens"]) {
    console.error(
      "Usage: ai-cli-cost-calculator --text <prompt> --output-tokens <number> [--json]",
    );
    process.exit(1);
  }

  const settled = await Promise.allSettled(
    MODELS.map(async (model) => {
      const { count, estimated } = await countTokens(args.text, model);
      const costs = calculateCost(count, args["output-tokens"], model);
      return { model, inputTokens: count, estimated, costs };
    }),
  );

  const results = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      results.push(r.value);
    } else {
      console.error(r.reason.message);
    }
  }

  if (results.length === 0) {
    console.error("No models produced results");
    process.exit(1);
  }

  if (args.json) {
    renderJson(results);
  } else {
    renderTable(results, args["output-tokens"]);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
