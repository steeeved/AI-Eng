import type { FieldSpec, FillFormRequest, FilledField } from '$lib/contracts/fill-form';
import {
	ProviderError,
	type FillFormProvider,
	type ProviderCallOptions,
	type ProviderResult,
	type StreamHandlers
} from './types';

/**
 * Deterministic label-scanning extractor. This is not clever and is not meant
 * to be — it exists so the UI, the error paths and the response contract are
 * all exercised before a single token is spent. It fails on unlabelled prose,
 * which is exactly the gap the real provider has to close.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const DATE = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/;
const NUMBER = /-?[\d][\d,\s]*(?:\.\d+)?/;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function coerce(raw: string, field: FieldSpec): string | null {
	const text = raw.trim();
	if (!text) return null;

	switch (field.type) {
		case 'email':
			return text.match(EMAIL)?.[0] ?? null;
		case 'date':
			return text.match(DATE)?.[0] ?? null;
		case 'number': {
			const hit = text.match(NUMBER)?.[0];
			return hit ? hit.replace(/[,\s]/g, '') : null;
		}
		case 'select': {
			const options = field.options ?? [];
			const exact = options.find((o) => o.toLowerCase() === text.toLowerCase());
			if (exact) return exact;
			// Longest first, on a word boundary. A naive substring test matches
			// "paid" inside "unpaid" and silently returns the opposite answer.
			return (
				[...options]
					.sort((a, b) => b.length - a.length)
					.find((o) => new RegExp(`\\b${escapeRegExp(o)}\\b`, 'i').test(text)) ?? null
			);
		}
		default:
			// Stop at a double space — table layouts put the next column there.
			return text.split(/\s{2,}/)[0].trim() || null;
	}
}

function byLabel(source: string, field: FieldSpec): FilledField | null {
	const needle = field.label.toLowerCase().trim();
	for (const line of source.split(/\r?\n/)) {
		const idx = line.toLowerCase().indexOf(needle);
		if (idx === -1) continue;
		const after = line.slice(idx + needle.length).replace(/^[\s:\-\u2013\u2014]+/, '');
		const value = coerce(after, field);
		if (value !== null) return { id: field.id, value, confidence: 0.55 };
	}
	return null;
}

function byShape(source: string, field: FieldSpec): FilledField | null {
	// Fallback: some types are recognisable anywhere in the document.
	if (field.type !== 'email' && field.type !== 'date') return null;
	const pattern = field.type === 'email' ? EMAIL : DATE;
	const hit = source.match(pattern)?.[0];
	return hit ? { id: field.id, value: hit, confidence: 0.3 } : null;
}

function extractFields(req: FillFormRequest): FilledField[] {
	return req.fields.map(
		(field) =>
			byLabel(req.source, field) ??
			byShape(req.source, field) ?? { id: field.id, value: null, confidence: 0 }
	);
}

/** Aborts the wait early and rejects, mirroring what a real cancelled upstream call does. */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(new DOMException('aborted', 'AbortError'));
			},
			{ once: true }
		);
	});
}

export const mockProvider: FillFormProvider = {
	name: 'mock',

	async fill(req: FillFormRequest): Promise<ProviderResult> {
		// Escape hatch so the UI's error path can be exercised without a real outage.
		if (req.source.includes('__fail')) {
			throw new ProviderError('mock provider asked to fail via __fail sentinel');
		}

		// Deterministic, roughly model-shaped latency — enough to see the spinner.
		await new Promise((resolve) => setTimeout(resolve, 120 + req.fields.length * 40));

		return { fields: extractFields(req), model: 'mock-scanner-v1', mock: true };
	},

	/**
	 * The mock has no tokens to stream, so it fakes the lifecycle instead:
	 * one 'connecting' tick, then one 'generating'/'preview' tick per field —
	 * enough ticks to prove the UI's progressive-state handling and, more
	 * importantly, its cancellation path (mid-stream Stop) without spending
	 * an Anthropic call on every manual test.
	 */
	async fillStream(
		req: FillFormRequest,
		handlers: StreamHandlers,
		opts?: ProviderCallOptions
	): Promise<ProviderResult> {
		if (req.source.includes('__fail')) {
			throw new ProviderError('mock provider asked to fail via __fail sentinel');
		}

		handlers.onProgress?.('connecting');
		await abortableDelay(80, opts?.signal);

		const perFieldMs = 60;
		for (let i = 0; i < req.fields.length; i++) {
			handlers.onProgress?.('generating');
			handlers.onPreview?.(`{"fields":[${'…,'.repeat(i)}"${req.fields[i].id}"?]}`);
			await abortableDelay(perFieldMs, opts?.signal);
		}

		return { fields: extractFields(req), model: 'mock-scanner-v1', mock: true };
	}
};
