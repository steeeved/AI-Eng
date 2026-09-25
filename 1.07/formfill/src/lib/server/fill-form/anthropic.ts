import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { traceable } from 'langsmith/traceable';
import { Client as LangSmithClient } from 'langsmith';
import { config } from '$lib/server/config';
import { FilledField, type FillFormRequest } from '$lib/contracts/fill-form';
import {
	ProviderError,
	TimeoutError,
	type FillFormProvider,
	type ProviderCallOptions,
	type ProviderResult
} from './types';

/** Leaves headroom under the route's 60s `maxDuration` for our own response validation. */
const DEFAULT_TIMEOUT_MS = 55_000;

/**
 * USD per million tokens, used only to attach a cost estimate to each trace.
 * The Anthropic API returns token counts, never a dollar figure — verify
 * these against https://www.anthropic.com/pricing#api before trusting them
 * for a real invoice; prices drift and this table is not fetched live.
 */
const PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
	'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
	'claude-sonnet-4-6': { input: 3.0, output: 15.0 }
};

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | undefined {
	const price = PRICING_PER_MILLION[model];
	if (!price) return undefined;
	return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

const ExtractionResult = z.object({ fields: z.array(FilledField) });

/**
 * Forced tool-use is Claude's structured-output guarantee: give it exactly
 * one tool shaped like the answer and force tool_choice so it cannot reply
 * with prose instead. The tool is never actually "called" — its input IS the
 * answer. Unlike OpenAI's strict json_schema mode this isn't grammar-enforced
 * by the API, so we still validate the tool input with our own Zod schema
 * below and treat a mismatch as a ProviderError rather than trusting it.
 */
const EXTRACTION_TOOL: Anthropic.Tool = {
	name: 'record_extraction',
	description: 'Record the extracted value and confidence for every requested field.',
	input_schema: {
		type: 'object',
		properties: {
			fields: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						value: { type: ['string', 'null'], description: 'null if genuinely not found — never invent one' },
						confidence: { type: 'number', minimum: 0, maximum: 1 }
					},
					required: ['id', 'value', 'confidence']
				}
			}
		},
		required: ['fields']
	}
};

function prompt(req: FillFormRequest): string {
	const spec = req.fields
		.map(
			(f) =>
				`- id="${f.id}" label="${f.label}" type=${f.type}${f.options ? ` options=[${f.options.join(', ')}]` : ''}`
		)
		.join('\n');
	return [
		'Extract the requested fields from the source document below, then call record_extraction.',
		'For each requested field, give its id, the extracted value as a string (or null if genuinely not present — never invent one), and your confidence from 0 to 1.',
		'',
		'Fields to extract:',
		spec,
		'',
		'Source document:',
		'"""',
		req.source,
		'"""'
	].join('\n');
}

export const anthropicProvider: FillFormProvider = {
	name: 'anthropic',

	async fill(req: FillFormRequest, opts?: ProviderCallOptions): Promise<ProviderResult> {
		// A visitor's own key (from the Settings modal, via request header) wins
		// over this deployment's env var — nobody has to trust the deployer
		// with usage on their own account.
		const apiKey = opts?.anthropicApiKey ?? config.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new ProviderError(
				'no Anthropic API key configured — set one in Settings, or ANTHROPIC_API_KEY on the deployment'
			);
		}
		const model = opts?.anthropicModel ?? config.ANTHROPIC_MODEL;
		const client = new Anthropic({ apiKey });

		// Tracing is genuinely optional per request: no key, no trace, no error.
		const langsmithApiKey = opts?.langsmithApiKey ?? config.LANGSMITH_API_KEY;
		const langsmithTracing = opts?.langsmithTracing ?? config.LANGSMITH_TRACING === 'true';
		const tracingEnabled = langsmithTracing && Boolean(langsmithApiKey);

		const rawCreate = async (params: Anthropic.MessageCreateParamsNonStreaming) => {
			const message = await client.messages.create(params, {
				signal: opts?.signal,
				timeout: DEFAULT_TIMEOUT_MS
			});
			const costUsd = estimateCostUsd(
				params.model,
				message.usage.input_tokens,
				message.usage.output_tokens
			);
			return { message, usage: message.usage, costUsd };
		};

		// There's no first-party `wrapAnthropic` the way LangSmith ships
		// `wrapOpenAI`, so this is the "trace any code" path: wrap the raw call
		// in its own span, built fresh per request against whichever LangSmith
		// project/key applies to THIS caller — the deployment's, or a visitor's
		// own from Settings.
		const create = tracingEnabled
			? traceable(rawCreate, {
					name: 'anthropic.messages.create',
					client: new LangSmithClient({ apiKey: langsmithApiKey }),
					project_name: opts?.langsmithProject ?? config.LANGSMITH_PROJECT
				})
			: rawCreate;

		try {
			const { message } = await create({
				model,
				max_tokens: 1024,
				tools: [EXTRACTION_TOOL],
				tool_choice: { type: 'tool', name: 'record_extraction' },
				messages: [{ role: 'user', content: prompt(req) }]
			});

			const toolUse = message.content.find(
				(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
			);
			if (!toolUse) {
				throw new ProviderError('anthropic did not return a tool_use block');
			}

			const parsed = ExtractionResult.parse(toolUse.input);

			// Guard against the model answering a different field set than asked.
			const byId = new Map(parsed.fields.map((f) => [f.id, f]));
			const fields = req.fields.map(
				(f) => byId.get(f.id) ?? { id: f.id, value: null, confidence: 0 }
			);

			return { fields, model, mock: false };
		} catch (error) {
			if (error instanceof ProviderError) throw error;
			if (error instanceof Anthropic.APIConnectionTimeoutError || opts?.signal?.aborted) {
				throw new TimeoutError(
					`anthropic did not respond within ${DEFAULT_TIMEOUT_MS}ms`,
					DEFAULT_TIMEOUT_MS
				);
			}
			throw new ProviderError(
				error instanceof Error ? error.message : 'unexpected anthropic failure',
				error
			);
		}
	}
};
