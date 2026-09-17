import { config } from '$lib/server/config';
import { mockProvider } from './mock';
import { anthropicProvider } from './anthropic';
import type { FillFormProvider } from './types';

const providers: Record<string, FillFormProvider> = {
	mock: mockProvider,
	anthropic: anthropicProvider
};

/**
 * `override` is the request body's `provider?` field — this is what proves
 * the abstraction per-request, with zero deploys. Falls back to
 * FILL_FORM_PROVIDER (read at runtime via $env/dynamic/private, so flipping it
 * in the Vercel dashboard takes effect on redeploy without a code change),
 * then to the mock. `override` is already constrained by the Zod enum in the
 * contract, so an unrecognised value never reaches here — only a dashboard
 * typo in FILL_FORM_PROVIDER can, and that degrades to the mock rather than
 * throwing a 500.
 */
export function getProvider(override?: string): FillFormProvider {
	const name = override ?? config.FILL_FORM_PROVIDER;
	return providers[name] ?? mockProvider;
}

export type { FillFormProvider } from './types';
