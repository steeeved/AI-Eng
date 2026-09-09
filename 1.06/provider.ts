/**
 * Promptfoo custom provider: routes each test case through the real 1.05 extractor
 * rather than through a raw model call.
 *
 * This matters. If the eval called the Anthropic API directly with a prompt string, it
 * would test the prompt and nothing else — your schema, your retry loop and your date
 * pinning would all be untested, and a regression in any of them would ship green.
 * The unit under test is `extractStandup`, so that is what the provider calls.
 */

import { extractStandup } from "../1.05/extract";

interface CallContext {
  vars?: Record<string, unknown>;
}

export default class StandupExtractorProvider {
  id() {
    return "standup-extractor";
  }

  async callApi(prompt: string, context?: CallContext) {
    const vars = context?.vars ?? {};
    const text = String(vars.text ?? prompt);
    const today = String(vars.today ?? "2026-09-08");

    try {
      const { data, attempts, usage } = await extractStandup(text, { today });
      return {
        output: JSON.stringify(data),
        tokenUsage: {
          prompt: usage.promptTokens,
          completion: usage.completionTokens,
          total: usage.totalTokens,
        },
        // Surfaced in the web viewer — attempts > 1 means constrained decoding did not
        // hold and the retry fallback saved you. Worth watching, not worth failing on.
        metadata: { attempts },
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
