/**
 * calculator.js — compute costs given token counts and model pricing.
 *
 * Formula from acceptance criteria:
 *   total = (inputTokens × inputPricePer1M / 1_000_000)
 *         + (outputTokens × outputPricePer1M / 1_000_000)
 *
 *   cachedInputCost = (inputTokens × cachedInputPricePer1M / 1_000_000)
 *                     — only when model.cachedInputPricePer1M is not null
 *
 * TODO: Implement calculateCost below.
 * Return all dollar amounts formatted to 6 decimal places (fractions of a cent matter here).
 */

/**
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {import('./models.js').Model} model
 * @returns {{
 *   inputCost: number,
 *   outputCost: number,
 *   totalCost: number,
 *   cachedInputCost: number | null
 * }}
 */
export function calculateCost(inputTokens, outputTokens, model) {
  const inputCost = inputTokens * model.inputPricePer1M / 1_000_000;
  const outputCost = outputTokens * model.outputPricePer1M / 1_000_000;
  const totalCost = inputCost + outputCost;
  const cachedInputCost = model.cachedInputPricePer1M != null
    ? inputTokens * model.cachedInputPricePer1M / 1_000_000
    : null;

  return { inputCost, outputCost, totalCost, cachedInputCost };
}
