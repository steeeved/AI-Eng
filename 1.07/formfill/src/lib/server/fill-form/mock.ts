import type { FieldSpec, FillFormRequest, FilledField } from '$lib/contracts/fill-form';
import { ProviderError, type FillFormProvider, type ProviderResult } from './types';

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

export const mockProvider: FillFormProvider = {
	name: 'mock',

	async fill(req: FillFormRequest): Promise<ProviderResult> {
		// Escape hatch so the UI's error path can be exercised without a real outage.
		if (req.source.includes('__fail')) {
			throw new ProviderError('mock provider asked to fail via __fail sentinel');
		}

		// Deterministic, roughly model-shaped latency — enough to see the spinner.
		await new Promise((resolve) => setTimeout(resolve, 120 + req.fields.length * 40));

		const fields = req.fields.map(
			(field) =>
				byLabel(req.source, field) ??
				byShape(req.source, field) ?? { id: field.id, value: null, confidence: 0 }
		);

		return { fields, model: 'mock-scanner-v1', mock: true };
	}
};
