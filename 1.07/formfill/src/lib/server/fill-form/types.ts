import type { FillFormRequest, FilledField } from '$lib/contracts/fill-form';

/**
 * Providers return the answer plus how it was produced. They do NOT set
 * latencyMs — the route owns the clock, so every provider is timed the
 * same way and no provider can lie about it.
 */
export type ProviderResult = {
	fields: FilledField[];
	model: string;
	mock: boolean;
};

/**
 * Per-request overrides, sourced from the browser's Settings modal (see
 * +page.svelte) via request headers, not from server env vars. Letting a
 * visitor bring their own credentials means this deployment's owner never
 * has to hold everyone's keys. Any field left undefined falls back to
 * `$lib/server/config`.
 */
export type ProviderCallOptions = {
	signal?: AbortSignal;
	anthropicApiKey?: string;
	anthropicModel?: string;
	langsmithApiKey?: string;
	langsmithProject?: string;
	langsmithTracing?: boolean;
};

export interface FillFormProvider {
	readonly name: string;
	fill(req: FillFormRequest, opts?: ProviderCallOptions): Promise<ProviderResult>;
}

/** Thrown by providers that exist as a seam but have no implementation yet. */
export class NotImplementedError extends Error {
	readonly code = 'not_implemented' as const;
}

/** Thrown when the upstream model call fails. Maps to a 502. */
export class ProviderError extends Error {
	readonly code = 'provider_error' as const;
	constructor(
		message: string,
		readonly cause?: unknown
	) {
		super(message);
	}
}

/** Thrown when the upstream call did not finish inside the configured deadline. Maps to a 504. */
export class TimeoutError extends Error {
	readonly code = 'timeout' as const;
	constructor(
		message: string,
		readonly timeoutMs: number
	) {
		super(message);
	}
}
