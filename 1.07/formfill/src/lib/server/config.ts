import { env } from '$env/dynamic/private';
import { z } from 'zod';

/**
 * One place a new user's own keys land — bring an ANTHROPIC_API_KEY, an
 * optional ANTHROPIC_MODEL, and LangSmith tracing vars, and everything else
 * just works. Every provider/route imports `config`; nobody else touches
 * `$env/dynamic/private` directly. A missing ANTHROPIC_API_KEY is not a
 * startup error — mock-only usage must keep working — the anthropic
 * provider is what throws a proper 502 the moment it's actually asked for.
 *
 * `$env/dynamic/private` reports a declared-but-blank line (`FOO=` in
 * `.env`, or an unset Vercel var) as `""`, not `undefined` — so `.optional()`
 * and `.default()` never fire on their own. `blankToUndefined` normalises
 * that before validation runs.
 */
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

const ConfigSchema = z.object({
	FILL_FORM_PROVIDER: z.preprocess(blankToUndefined, z.enum(['mock', 'anthropic']).default('mock')),
	ANTHROPIC_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
	ANTHROPIC_MODEL: z.preprocess(
		blankToUndefined,
		z.string().min(1).default('claude-haiku-4-5-20251001')
	),
	LANGSMITH_TRACING: z.preprocess(blankToUndefined, z.enum(['true', 'false']).default('false')),
	LANGSMITH_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
	LANGSMITH_PROJECT: z.preprocess(blankToUndefined, z.string().min(1).default('formfill'))
});

export const config = ConfigSchema.parse(env);

export const hasAnthropicKey = Boolean(config.ANTHROPIC_API_KEY);
export const langsmithEnabled = config.LANGSMITH_TRACING === 'true' && Boolean(config.LANGSMITH_API_KEY);
