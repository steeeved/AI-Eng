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

export interface FillFormProvider {
	readonly name: string;
	fill(req: FillFormRequest): Promise<ProviderResult>;
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
