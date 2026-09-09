import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	FillFormRequest,
	FillFormResponse,
	type FillFormError
} from '$lib/contracts/fill-form';
import { getProvider } from '$lib/server/fill-form';
import { NotImplementedError, ProviderError } from '$lib/server/fill-form/types';

// Without this SvelteKit will try to prerender the endpoint if anything
// reachable from a prerenderable parent touches it. Non-negotiable on /api.
export const prerender = false;

// Per-route override. maxDuration matters the day a real model call goes in
// here: the platform default is 10s and an LLM round trip will blow through it.
export const config = {
	runtime: 'nodejs22.x',
	maxDuration: 60
};

function fail(status: number, body: FillFormError) {
	return json(body, { status });
}

/** Health + provenance. Lets the smoke test ask prod which provider it is running. */
export const GET: RequestHandler = async () => {
	const provider = getProvider();
	return json({ ok: true, provider: provider.name });
};

export const POST: RequestHandler = async ({ request }) => {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return fail(400, { error: 'invalid_request', message: 'body must be valid JSON' });
	}

	const parsed = FillFormRequest.safeParse(raw);
	if (!parsed.success) {
		return fail(422, {
			error: 'invalid_request',
			message: 'request did not match the contract',
			issues: parsed.error.issues.map((issue) => ({
				path: issue.path.map(String).join('.'),
				message: issue.message
			}))
		});
	}

	// The route owns the clock so no provider can misreport its own latency.
	const startedAt = Date.now();

	try {
		const result = await getProvider().fill(parsed.data);

		// Validate our own output, not just the input. On the day the real
		// provider lands this is what catches contract drift — loudly, here,
		// instead of silently rendering blanks in the UI.
		const payload = FillFormResponse.safeParse({
			fields: result.fields,
			meta: {
				mock: result.mock,
				model: result.model,
				latencyMs: Date.now() - startedAt
			}
		});

		if (!payload.success) {
			console.error('[fill-form] response failed its own contract', payload.error.issues);
			return fail(502, {
				error: 'provider_error',
				message: 'provider returned a response that does not match the contract'
			});
		}

		return json(payload.data);
	} catch (error) {
		if (error instanceof NotImplementedError) {
			return fail(501, { error: 'not_implemented', message: error.message });
		}
		if (error instanceof ProviderError) {
			return fail(502, { error: 'provider_error', message: error.message });
		}
		console.error('[fill-form] unexpected provider failure', error);
		return fail(502, { error: 'provider_error', message: 'unexpected provider failure' });
	}
};
