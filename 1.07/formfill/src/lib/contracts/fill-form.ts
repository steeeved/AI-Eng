import { z } from 'zod';

/**
 * The contract. This module is the single source of truth for the shape of
 * /api/fill-form. The route handler, every provider, the fixtures and the
 * client all import from here. Swapping the mock for a real model must not
 * require editing anything else.
 */

export const FieldType = z.enum(['text', 'email', 'number', 'date', 'select']);
export type FieldType = z.infer<typeof FieldType>;

export const FieldSpec = z.object({
	id: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z0-9_]+$/, 'ids must be lowercase snake_case'),
	label: z.string().min(1).max(120),
	type: FieldType,
	options: z.array(z.string()).optional()
});
export type FieldSpec = z.infer<typeof FieldSpec>;

/** Every provider the route knows how to dispatch to. Keep in sync with server/fill-form/index.ts. */
export const ProviderName = z.enum(['mock', 'anthropic']);
export type ProviderName = z.infer<typeof ProviderName>;

export const FillFormRequest = z.object({
	fields: z.array(FieldSpec).min(1).max(50),
	source: z.string().min(1).max(20_000),
	/**
	 * Per-request override of which backing model answers this call. Omit to
	 * use the deployment's FILL_FORM_PROVIDER default. This is what proves the
	 * 1.04 abstraction: a client swaps models with a body field, zero deploys.
	 */
	provider: ProviderName.optional()
});
export type FillFormRequest = z.infer<typeof FillFormRequest>;

export const FilledField = z.object({
	id: z.string(),
	/** null means "the model could not find this in the source" — not "empty string". */
	value: z.string().nullable(),
	confidence: z.number().min(0).max(1)
});
export type FilledField = z.infer<typeof FilledField>;

export const FillFormResponse = z.object({
	fields: z.array(FilledField),
	meta: z.object({
		/** Bound to a badge in the UI, and asserted false by the prod smoke test. */
		mock: z.boolean(),
		model: z.string(),
		provider: z.string(),
		latencyMs: z.number().int().nonnegative()
	})
});
export type FillFormResponse = z.infer<typeof FillFormResponse>;

/**
 * RFC 9457 (Problem Details for HTTP APIs). Served as
 * `application/problem+json` on every non-2xx response. `type` identifies the
 * failure *class*; `status` must always equal the actual HTTP status code so
 * clients that only read the body still get the right number. Fields beyond
 * the core five (`errors`, `provider`, `timeoutMs`) are RFC 9457 extension
 * members — the spec explicitly allows adding them per problem type.
 */
export const ProblemType = z.enum([
	'bad-request',
	'validation-error',
	'not-implemented',
	'provider-error',
	'timeout'
]);
export type ProblemType = z.infer<typeof ProblemType>;

export const ProblemDetails = z.object({
	type: z.string(),
	title: z.string(),
	status: z.number().int(),
	detail: z.string().optional(),
	instance: z.string().optional(),
	errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
	provider: z.string().optional(),
	timeoutMs: z.number().optional()
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;
