/**
 * display.js — render results as a table or JSON.
 *
 * Table columns (from acceptance criteria):
 *   Model | Tier | Input Tokens | Output Tokens | Input Cost | Cached Input Cost | Output Cost | Total Cost | Context Window | Max Output | Pricing Source
 *
 * For estimated token counts, append " (~±10%)" to the token count.
 *
 * TODO: Implement both functions below.
 *
 * Hints:
 *   - Use the `cli-table3` package for the ASCII table.
 *     import Table from 'cli-table3'
 *   - Format dollar amounts with toFixed(6) and prefix with '$'
 *   - For JSON output, just JSON.stringify(results, null, 2)
 */

import Table from "cli-table3";

function fmt$(n) {
  return `$${n.toFixed(6)}`;
}

/**
 * @param {Array<{model, inputTokens, estimated, costs}>} results
 * @param {number} outputTokens
 */
export function renderTable(results, outputTokens) {
  const table = new Table({
    head: [
      "Model", "Tier", "Input Tokens", "Output Tokens",
      "Input Cost", "Cached Input Cost", "Output Cost",
      "Total Cost", "Context Window", "Max Output", "Pricing Source",
    ],
  });

  for (const r of results) {
    const inputTokensLabel = r.estimated
      ? `${r.inputTokens} (~±10%)`
      : String(r.inputTokens);

    const cachedLabel = r.costs.cachedInputCost == null
      ? "N/A"
      : fmt$(r.costs.cachedInputCost);

    table.push([
      r.model.name,
      r.model.tier,
      inputTokensLabel,
      String(outputTokens),
      fmt$(r.costs.inputCost),
      cachedLabel,
      fmt$(r.costs.outputCost),
      fmt$(r.costs.totalCost),
      String(r.model.contextWindow),
      String(r.model.maxOutputTokens),
      r.model.pricingSource,
    ]);
  }

  console.log(table.toString());
}

/**
 * @param {Array<{model, inputTokens, estimated, costs}>} results
 */
export function renderJson(results) {
  console.log(JSON.stringify(results, null, 2));
}
