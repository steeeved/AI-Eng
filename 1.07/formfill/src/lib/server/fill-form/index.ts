import { env } from '$env/dynamic/private';
import { mockProvider } from './mock';
import { openaiProvider } from './openai';
import type { FillFormProvider } from './types';

const providers: Record<string, FillFormProvider> = {
	mock: mockProvider,
	openai: openaiProvider
};

/**
 * Read per-request, not at module load: $env/dynamic/private is resolved at
 * runtime, so flipping FILL_FORM_PROVIDER in the Vercel dashboard takes effect
 * on redeploy without a code change. Unknown values fall back to the mock
 * rather than throwing — a typo in the dashboard should degrade, not 500.
 */
export function getProvider(): FillFormProvider {
	return providers[env.FILL_FORM_PROVIDER ?? 'mock'] ?? mockProvider;
}

export type { FillFormProvider } from './types';
