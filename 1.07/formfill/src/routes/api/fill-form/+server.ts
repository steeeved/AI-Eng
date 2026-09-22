import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	FillFormRequest,
	FillFormResponse,
	type FillFormStreamEvent,
	type ProblemDetails
} from '$lib/contracts/fill-form';
import { getProvider, streamProvider } from '$lib/server/fill-form';
import { config as appConfig } from '$lib/server/config';
import {
	CancelledError,
	NotImplementedError,
	ProviderError,
	TimeoutError
} from '$lib/server/fill-form/types';
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

const encoder = new TextEncoder();

/**
 * One SSE `data:` frame per event, exactly as the contract's
 * FillFormStreamEvent union defines it. This is hand-rolled rather than
 * pulled from a library because the format is three lines: a JSON-encoded
 * payload, a blank line, done. `fetch` reads a POST response body as a
 * stream just fine — native `EventSource` is GET-only and can't carry the
 * request body this route needs, which is why the client reads this with
 * `response.body.getReader()` instead of `new EventSource(...)`.
 */
function sseFrame(event: FillFormStreamEvent): Uint8Array {
	return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export const POST: RequestHandler = async ({ request, url }) => {
	const instance = url.pathname;
	const clientOverrides = readClientOverrides(request);

	// Body parsing and contract validation still happen before the stream
	// opens — a malformed request should get one plain JSON problem response
	// and never cost a provider call, exactly as before 1.09.
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

	const startedAt = Date.now();
	const provider = getProvider(parsed.data.provider);

	// Two independent reasons the stream can be cut short, tracked as two
	// separate AbortControllers so the catch block below can tell them apart
	// afterwards — `clientSignal.aborted` means the visitor cancelled or
	// disconnected; `routeTimeoutController.signal.aborted` means our own
	// backstop fired. Providers only ever see the merged signal; they don't
	// need to know which caller is responsible, only that they must stop.
	const routeTimeoutController = new AbortController();
	const timeout = setTimeout(() => routeTimeoutController.abort(), ROUTE_TIMEOUT_MS);
	const clientSignal = request.signal;
	const combinedSignal = AbortSignal.any([routeTimeoutController.signal, clientSignal]);
	const opts: ProviderCallOptions = { ...clientOverrides, signal: combinedSignal };

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: FillFormStreamEvent) => controller.enqueue(sseFrame(event));

			try {
				const result = await streamProvider(
					provider,
					parsed.data,
					{
						onProgress: (stage) =>
							send({ type: 'progress', stage, elapsedMs: Date.now() - startedAt }),
						onPreview: (partial) => send({ type: 'preview', partial })
					},
					opts
				);

				// Validate our own output, not just the input. On the day a
				// provider's behaviour drifts, this is what catches it loudly,
				// here — instead of silently rendering blanks in the UI. A
				// contract failure is a terminal `error` event, never a thrown
				// 500 the client can't see once headers are already sent.
				const payload = FillFormResponse.safeParse({
					fields: result.fields,
					meta: {
						mock: result.mock,
						model: result.model,
						provider: provider.name,
						latencyMs: Date.now() - startedAt
					}
				});

				if (!payload.success) {
					console.error('[fill-form] response failed its own contract', payload.error.issues);
					send({
						type: 'error',
						problem: {
							type: 'https://formfill.dev/problems/provider-error',
							title: 'Provider returned a response that does not match the contract',
							status: 502,
							instance,
							provider: provider.name
						}
					});
				} else {
					send({ type: 'result', data: payload.data });
				}
			} catch (error) {
				if (clientSignal.aborted) {
					// The visitor's own AbortController firing is already
					// authoritative on the client — this event lets the UI
					// confirm the SERVER stopped too, not just the local fetch.
					send({ type: 'cancelled' });
				} else if (routeTimeoutController.signal.aborted) {
					send({
						type: 'error',
						problem: {
							type: 'https://formfill.dev/problems/timeout',
							title: 'Upstream provider did not respond in time',
							status: 504,
							instance,
							timeoutMs: ROUTE_TIMEOUT_MS
						}
					});
				} else if (error instanceof CancelledError) {
					send({ type: 'cancelled' });
				} else if (error instanceof NotImplementedError) {
					send({
						type: 'error',
						problem: {
							type: 'https://formfill.dev/problems/not-implemented',
							title: 'Provider is not implemented yet',
							status: 501,
							instance,
							detail: error.message
						}
					});
				} else if (error instanceof TimeoutError) {
					send({
						type: 'error',
						problem: {
							type: 'https://formfill.dev/problems/timeout',
							title: 'Upstream provider did not respond in time',
							status: 504,
							instance,
							detail: error.message,
							timeoutMs: error.timeoutMs
						}
					});
				} else if (error instanceof ProviderError) {
					send({
						type: 'error',
						problem: {
							type: 'https://formfill.dev/problems/provider-error',
							title: 'Upstream provider failed',
							status: 502,
							instance,
							detail: error.message
						}
					});
				} else {
					console.error('[fill-form] unexpected failure', error);
					send({
						type: 'error',
						problem: {
							type: 'https://formfill.dev/problems/provider-error',
							title: 'Unexpected provider failure',
							status: 502,
							instance
						}
					});
				}
			} finally {
				clearTimeout(timeout);
				controller.close();
			}
		},
		cancel() {
			// Fires when the client calls reader.cancel() (our Stop button) or
			// disconnects. clientSignal is the same request.signal already
			// threaded into `opts`, so the in-flight provider call sees the
			// abort on its own — nothing extra to propagate here.
			clearTimeout(timeout);
		}
	});

	return new Response(stream, {
		status: 200,
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
