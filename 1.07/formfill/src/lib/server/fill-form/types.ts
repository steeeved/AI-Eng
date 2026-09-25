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

/**
 * Callbacks the route hands a provider during a streaming call. Both are
 * fire-and-forget from the provider's side — it does not await them, it
 * just reports what it knows as it knows it. Nothing here is authoritative
 * until fillStream's returned Promise resolves with a ProviderResult.
 */
export type StreamHandlers = {
	onProgress?: (stage: 'connecting' | 'generating') => void;
	/** Raw, not-yet-validated partial output. See StreamPreviewEvent in the contract for why this is never parsed into fields here. */
	onPreview?: (partial: string) => void;
};

export interface FillFormProvider {
	readonly name: string;
	fill(req: FillFormRequest, opts?: ProviderCallOptions): Promise<ProviderResult>;
	/**
	 * Optional: a provider that can report real progress implements this in
	 * addition to fill(). The route falls back to wrapping fill() with a
	 * single synthetic 'generating' tick when a provider has no fillStream —
	 * see streamProvider() in server/fill-form/index.ts. Must still honour
	 * opts.signal exactly like fill() does.
	 */
	fillStream?(
		req: FillFormRequest,
		handlers: StreamHandlers,
		opts?: ProviderCallOptions
	): Promise<ProviderResult>;
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

/**
 * Thrown by a provider when its call was aborted via opts.signal rather than
 * failing on its own. The route is what decides *why* the signal fired (the
 * route-level timeout backstop vs. the client disconnecting) — it owns both
 * AbortControllers a provider's combined signal is built from — so this
 * error deliberately carries no timeoutMs. A provider only needs to say
 * "I stopped because you told me to," never guess which of the two callers
 * was responsible.
 */
export class CancelledError extends Error {
	readonly code = 'cancelled' as const;
}
