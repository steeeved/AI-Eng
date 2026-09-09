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

export const FillFormRequest = z.object({
	fields: z.array(FieldSpec).min(1).max(50),
	source: z.string().min(1).max(20_000)
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
		latencyMs: z.number().int().nonnegative()
	})
});
export type FillFormResponse = z.infer<typeof FillFormResponse>;

export const ErrorCode = z.enum([
	'invalid_request',
	'provider_error',
	'not_implemented',
	'rate_limited'
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const FillFormError = z.object({
	error: ErrorCode,
	message: z.string(),
	issues: z.array(z.object({ path: z.string(), message: z.string() })).optional()
});
export type FillFormError = z.infer<typeof FillFormError>;
