import type { FillFormRequest } from '$lib/contracts/fill-form';
import { config } from '$lib/server/config';
import { mockProvider } from './mock';
import { anthropicProvider } from './anthropic';
import type { FillFormProvider, ProviderCallOptions, ProviderResult, StreamHandlers } from './types';

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

/**
 * Every caller of a provider's streaming path goes through here, never
 * provider.fillStream directly. A provider that hasn't implemented
 * fillStream still behaves correctly under 1.09 — it just can't report real
 * mid-flight progress, only a single 'connecting' -> 'generating' -> done.
 * This is what let 1.09 ship against both providers without the mock
 * needing token-level streaming to prove out first.
 */
export async function streamProvider(
	provider: FillFormProvider,
	req: FillFormRequest,
	handlers: StreamHandlers,
	opts?: ProviderCallOptions
): Promise<ProviderResult> {
	if (provider.fillStream) {
		return provider.fillStream(req, handlers, opts);
	}
	handlers.onProgress?.('connecting');
	handlers.onProgress?.('generating');
	return provider.fill(req, opts);
}

export type { FillFormProvider } from './types';
