import { json } from '@sveltejs/kit';
import { traceable } from 'langsmith/traceable';
import { Client as LangSmithClient } from 'langsmith';
import type { RequestHandler } from './$types';
import { FillFormRequest, FillFormResponse, type ProblemDetails } from '$lib/contracts/fill-form';
import { getProvider } from '$lib/server/fill-form';
import { config as appConfig } from '$lib/server/config';
import { NotImplementedError, ProviderError, TimeoutError } from '$lib/server/fill-form/types';
import type { ProviderCallOptions } from '$lib/server/fill-form/types';

// Without this SvelteKit will try to prerender the endpoint if anything
// reachable from a prerenderable parent touches it. Non-negotiable on /api.
export const prerender = false;

// Per-route override. maxDuration matters the day a real model call goes in
// here: the platform default is 10s and an LLM round trip will blow through it.
export const config = {
	runtime: 'nodejs22.x',
	maxDuration: 60
};

/** Route-level backstop: fires even if a provider ignores its AbortSignal. */
const ROUTE_TIMEOUT_MS = 58_000;

function problem(instance: string, status: number, body: Omit<ProblemDetails, 'status' | 'instance'>) {
	const payload: ProblemDetails = { ...body, status, instance };
	return json(payload, { status, headers: { 'content-type': 'application/problem+json' } });
}

/**
 * A visitor's own credentials, sent from the Settings modal in +page.svelte
 * as request headers rather than stored anywhere server-side. Never logged.
 */
function readClientOverrides(request: Request): ProviderCallOptions {
	const tracingHeader = request.headers.get('x-langsmith-tracing');
	return {
		anthropicApiKey: request.headers.get('x-anthropic-api-key') || undefined,
		anthropicModel: request.headers.get('x-anthropic-model') || undefined,
		langsmithApiKey: request.headers.get('x-langsmith-api-key') || undefined,
		langsmithProject: request.headers.get('x-langsmith-project') || undefined,
		langsmithTracing: tracingHeader === 'true' ? true : tracingHeader === 'false' ? false : undefined
	};
}

/** Health + provenance. Lets the smoke test ask prod which provider it is running. */
export const GET: RequestHandler = async () => {
	const provider = getProvider();
	return json({ ok: true, provider: provider.name });
};

async function runFillFormRaw(input: {
	data: ReturnType<typeof FillFormRequest.parse>;
	opts: ProviderCallOptions;
}) {
	const provider = getProvider(input.data.provider);
	const startedAt = Date.now();
	const result = await provider.fill(input.data, input.opts);
	return { result, provider: provider.name, latencyMs: Date.now() - startedAt };
}

export const POST: RequestHandler = async ({ request, url }) => {
	const instance = url.pathname;
	const clientOverrides = readClientOverrides(request);

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return problem(instance, 400, {
			type: 'https://formfill.dev/problems/bad-request',
			title: 'Request body must be valid JSON',
			detail: 'Body could not be parsed as JSON.'
		});
	}

	const parsed = FillFormRequest.safeParse(raw);
	if (!parsed.success) {
		return problem(instance, 422, {
			type: 'https://formfill.dev/problems/validation-error',
			title: 'Request did not match the contract',
			detail: `${parsed.error.issues.length} field(s) failed validation.`,
			errors: parsed.error.issues.map((issue) => ({
				path: issue.path.map(String).join('.'),
				message: issue.message
			}))
		});
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
	const opts: ProviderCallOptions = { ...clientOverrides, signal: controller.signal };

	// Same "trace any code" pattern as the anthropic provider: built fresh per
	// request so a visitor's own LangSmith project/key (from Settings) is what
	// this request's top-level span lands in, not necessarily the deployment's.
	const langsmithApiKey = clientOverrides.langsmithApiKey ?? appConfig.LANGSMITH_API_KEY;
	const langsmithTracing = clientOverrides.langsmithTracing ?? appConfig.LANGSMITH_TRACING === 'true';
	const tracingEnabled = langsmithTracing && Boolean(langsmithApiKey);

	const runFillForm = tracingEnabled
		? traceable(runFillFormRaw, {
				name: 'fill-form',
				client: new LangSmithClient({ apiKey: langsmithApiKey }),
				project_name: clientOverrides.langsmithProject ?? appConfig.LANGSMITH_PROJECT
			})
		: runFillFormRaw;

	try {
		const timedOut = new Promise<never>((_, reject) => {
			controller.signal.addEventListener('abort', () =>
				reject(new TimeoutError(`request exceeded ${ROUTE_TIMEOUT_MS}ms`, ROUTE_TIMEOUT_MS))
			);
		});

		const { result, provider, latencyMs } = await Promise.race([
			runFillForm({ data: parsed.data, opts }),
			timedOut
		]);

		// Validate our own output, not just the input. On the day a provider's
		// behaviour drifts, this is what catches it loudly, here — instead of
		// silently rendering blanks in the UI.
		const payload = FillFormResponse.safeParse({
			fields: result.fields,
			meta: { mock: result.mock, model: result.model, provider, latencyMs }
		});

		if (!payload.success) {
			console.error('[fill-form] response failed its own contract', payload.error.issues);
			return problem(instance, 502, {
				type: 'https://formfill.dev/problems/provider-error',
				title: 'Provider returned a response that does not match the contract',
				provider
			});
		}

		return json(payload.data);
	} catch (error) {
		if (error instanceof NotImplementedError) {
			return problem(instance, 501, {
				type: 'https://formfill.dev/problems/not-implemented',
				title: 'Provider is not implemented yet',
				detail: error.message
			});
		}
		if (error instanceof TimeoutError) {
			return problem(instance, 504, {
				type: 'https://formfill.dev/problems/timeout',
				title: 'Upstream provider did not respond in time',
				detail: error.message,
				timeoutMs: error.timeoutMs
			});
		}
		if (error instanceof ProviderError) {
			return problem(instance, 502, {
				type: 'https://formfill.dev/problems/provider-error',
				title: 'Upstream provider failed',
				detail: error.message
			});
		}
		console.error('[fill-form] unexpected failure', error);
		return problem(instance, 502, {
			type: 'https://formfill.dev/problems/provider-error',
			title: 'Unexpected provider failure'
		});
	} finally {
		clearTimeout(timeout);
	}
};
