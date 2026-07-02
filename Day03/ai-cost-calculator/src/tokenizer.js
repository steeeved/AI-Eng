/**
 * tokenizer.js — count input tokens per model.
 *
 * Rules from the acceptance criteria:
 *   - OpenAI models  → use `gpt-tokenizer` (exact)
 *   - Claude models  → use Anthropic SDK `countTokens` (exact)
 *   - Gemini / Groq  → estimate as Math.ceil(charCount / 4), flag as ±10%
 *
 * TODO: Implement countTokens(text, model) below.
 *
 * Hints:
 *   - gpt-tokenizer: import { encode } from 'gpt-tokenizer'
 *     encode(text).length gives you the token count.
 *   - Anthropic SDK: const client = new Anthropic()
 *     const res = await client.messages.countTokens({ model: model.id, messages: [...] })
 *     res.input_tokens gives you the count.
 *   - For estimated models, return { count: estimate, estimated: true }
 *     For exact models, return { count: n, estimated: false }
 */

import Anthropic from "@anthropic-ai/sdk";
import { encode } from "gpt-tokenizer";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/**
 * @param {string} text - the prompt text
 * @param {import('./models.js').Model} model - model object from models.js
 * @returns {Promise<{ count: number, estimated: boolean }>}
 */
export async function countTokens(text, model) {
  if (model.tokenizerType === "gpt") {
    return { count: encode(text).length, estimated: false };
  }

  if (model.tokenizerType === "claude") {
    if (!anthropic) {
      const estimate = Math.ceil(text.length / 4);
      return { count: estimate, estimated: true };
    }
    const res = await anthropic.messages.countTokens({
      model: model.id,
      messages: [{ role: "user", content: text }],
    });
    return { count: res.input_tokens, estimated: false };
  }

  const estimate = Math.ceil(text.length / 4);
  return { count: estimate, estimated: true };
}
