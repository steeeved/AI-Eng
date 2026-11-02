#!/usr/bin/env bun
/**
 * Golden-set eval for FormFill (1.10).
 *
 * The unit under test is the deployed seam, not a copied prompt: every case is
 * POSTed to the real `/api/fill-form` route with `provider: "anthropic"`, so the
 * contract, the Zod validation, the forced tool-use and the provider wiring are
 * all exercised together. A prompt-only harness would stay green while any of
 * those regressed.
 *
 * Metrics are per field, not per case, because a case with six fields and one
 * wrong value is not "passed". Four outcomes are tracked separately:
 *
 *   correct   expected value matched
 *   wrong     a value came back, it was not the expected one
 *   miss      expected a value, got null
 *   invented  expected null, got a value  ← zero tolerance, own gate
 *
 * `invented` is the class a clerk cannot catch: a plausible value for a field
 * the source never contained. It is counted across every case, not just the
 * ones labelled absent-field, and it can never be traded against accuracy.
 *
 *   bun run eval [--base http://127.0.0.1:4173] [--out results.json]
 */
import cases from '../src/lib/fixtures/cases.json' with { type: 'json' };

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
	const arg = argv[i];
	if (!arg.startsWith('--')) continue;
	const [key, inline] = arg.slice(2).split('=');
	if (inline !== undefined) {
		args[key] = inline;
	} else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
		args[key] = argv[i + 1];
		i++;
	} else {
		args[key] = 'true';
	}
}

// Vite's default port is 5173; CI pins 4173. Probe rather than guess, so
// "nothing happened" is never a port mismatch.
const candidates = args.base
	? [args.base]
	: [process.env.EVAL_BASE_URL, 'http://127.0.0.1:5173', 'http://127.0.0.1:4173'].filter(Boolean);
let base = null;
for (const candidate of candidates) {
	const url = candidate.replace(/\/$/, '');
	try {
		const res = await fetch(`${url}/api/fill-form`);
		if (res.ok) {
			base = url;
			break;
		}
	} catch {
		// try the next candidate
	}
}
if (!base) {
	console.error(
		`No FormFill server answered on ${candidates.join(', ')}.\n` +
			'Start one first: bun run dev -- --host 127.0.0.1'
	);
	process.exit(1);
}

const outFile = args.out ?? 'results.json';
const provider = args.provider ?? 'anthropic';
const attempts = Number(args.attempts ?? 2);

function normalise(value) {
	if (value === null || value === undefined) return null;
	return String(value).trim();
}

function classify(expected, actual, type) {
	const e = normalise(expected);
	const a = normalise(actual);
	if (e === null) return a === null ? 'correct' : 'invented';
	if (a === null) return 'miss';
	// A number field is scored numerically: 2500 and 2500.00 are the same
	// answer. Expected values are still stored as plain digit strings, but the
	// comparator must not mistake formatting for extraction failure.
	if (type === 'number') {
		const en = Number(e.replace(/,/g, ''));
		const an = Number(a.replace(/,/g, ''));
		if (Number.isFinite(en) && Number.isFinite(an)) return en === an ? 'correct' : 'wrong';
	}
	return a === e ? 'correct' : 'wrong';
}

/** Read the SSE stream to its single terminal event, same framing the client uses. */
async function readStream(res) {
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let terminal = null;
	let ticks = 0;

	while (!terminal) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const parts = buffer.split('\n\n');
		buffer = parts.pop() ?? '';
		for (const part of parts) {
			const line = part.split('\n').find((l) => l.startsWith('data: '));
			if (!line) continue;
			const event = JSON.parse(line.slice('data: '.length));
			if (event.type === 'progress' || event.type === 'preview') ticks++;
			else terminal = event;
		}
	}
	return { terminal, ticks };
}

async function runCase(testCase) {
	const startedAt = Date.now();
	const headers = { 'content-type': 'application/json' };
	// The route already accepts a caller's own key (the UI Settings path), so a
	// local eval can supply its own key without editing the deployment's env.
	if (process.env.ANTHROPIC_API_KEY) headers['x-anthropic-api-key'] = process.env.ANTHROPIC_API_KEY;

	const res = await fetch(`${base}/api/fill-form`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ ...testCase.request, provider })
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`${testCase.id}: HTTP ${res.status} — ${body.slice(0, 300)}`);
	}

	const { terminal, ticks } = await readStream(res);
	if (terminal?.type === 'error') {
		const p = terminal.problem ?? {};
		throw new Error(`${testCase.id}: ${p.title ?? 'provider error'} — ${p.detail ?? ''}`);
	}
	if (terminal?.type !== 'result') {
		throw new Error(`${testCase.id}: stream ended without a result (${terminal?.type ?? 'none'})`);
	}

	const body = terminal.data;
	if (body.meta?.mock !== false) {
		throw new Error(
			`${testCase.id}: answered with the mock (meta.mock=${body.meta?.mock}). ` +
				'Run with FILL_FORM_PROVIDER=anthropic and a real ANTHROPIC_API_KEY.'
		);
	}

	const byId = new Map(body.fields.map((f) => [f.id, f]));
	const expectedIds = Object.keys(testCase.expected);
	const fields = expectedIds.map((id) => {
		const expected = testCase.expected[id];
		const got = byId.get(id);
		const type = testCase.request.fields.find((f) => f.id === id)?.type;
		return {
			id,
			expected,
			actual: got ? got.value : null,
			confidence: got ? got.confidence : null,
			status: got ? classify(expected, got.value, type) : 'miss'
		};
	});
	if (body.fields.length !== expectedIds.length) {
		throw new Error(
			`${testCase.id}: expected ${expectedIds.length} fields, got ${body.fields.length}`
		);
	}

	return {
		id: testCase.id,
		split: testCase.split ?? 'tuning',
		category: testCase.category ?? 'ordinary',
		description: testCase.description ?? '',
		model: body.meta.model,
		latencyMs: body.meta.latencyMs ?? Date.now() - startedAt,
		ticks,
		fields
	};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runWithRetry(testCase) {
	let lastError;
	for (let i = 1; i <= attempts; i++) {
		try {
			return await runCase(testCase);
		} catch (error) {
			lastError = error;
			// Contract/validation failures are deterministic; retrying them only
			// wastes a provider call. Transport and provider errors may be flaky.
			const message = error instanceof Error ? error.message : String(error);
			const retryable = !/HTTP 4\d\d|authentication_error|invalid x-api-key/.test(message);
			if (i === attempts || !retryable) break;
			console.warn(`  retry ${i}/${attempts} — ${message}`);
			await sleep(1500 * i);
		}
	}
	throw lastError;
}

function bucket(confidence) {
	if (confidence === null || confidence === undefined) return 'none';
	if (confidence < 0.5) return '<0.50';
	if (confidence < 0.7) return '0.50–0.69';
	if (confidence < 0.85) return '0.70–0.84';
	if (confidence < 0.95) return '0.85–0.94';
	return '0.95–1.00';
}

function summarise(caseResults) {
	const totals = { correct: 0, wrong: 0, miss: 0, invented: 0 };
	const bySplit = new Map();
	const calibration = new Map();
	let confidenceCorrect = [];
	let confidenceIncorrect = [];
	let inventedFields = [];

	for (const c of caseResults) {
		if (c.error) continue;
		for (const f of c.fields) {
			totals[f.status]++;
			const s = bySplit.get(c.split) ?? { correct: 0, wrong: 0, miss: 0, invented: 0 };
			s[f.status]++;
			bySplit.set(c.split, s);

			const b = bucket(f.confidence);
			const cal = calibration.get(b) ?? { total: 0, correct: 0 };
			cal.total++;
			if (f.status === 'correct') cal.correct++;
			calibration.set(b, cal);

			if (f.confidence !== null && f.confidence !== undefined) {
				(f.status === 'correct' ? confidenceCorrect : confidenceIncorrect).push(f.confidence);
			}
			if (f.status === 'invented') {
				inventedFields.push({ case: c.id, split: c.split, field: f.id, value: f.actual });
			}
		}
	}

	const ratio = (n, d) => (d === 0 ? 0 : n / d);
	const mean = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

	const splits = {};
	for (const [name, s] of bySplit) {
		const total = s.correct + s.wrong + s.miss + s.invented;
		splits[name] = { ...s, total, accuracy: ratio(s.correct, total) };
	}

	const fieldsTotal = totals.correct + totals.wrong + totals.miss + totals.invented;

	return {
		overall: { ...totals, total: fieldsTotal, accuracy: ratio(totals.correct, fieldsTotal) },
		splits,
		invented: { count: totals.invented, fields: inventedFields },
		calibration: {
			buckets: Object.fromEntries(
				[...calibration.entries()]
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([name, v]) => [name, { ...v, accuracy: ratio(v.correct, v.total) }])
			),
			meanConfidenceCorrect: mean(confidenceCorrect),
			meanConfidenceIncorrect: mean(confidenceIncorrect),
			note: 'Confidence is a number the model writes, not a measured probability. Treat the buckets as a report until they separate clearly.'
		}
	};
}

const startedAt = new Date().toISOString();
const caseResults = [];

let health;
try {
	const res = await fetch(`${base}/api/fill-form`);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	health = await res.json();
} catch (error) {
	console.error(
		`Cannot reach ${base}/api/fill-form (${error instanceof Error ? error.message : error}).\n` +
			'Start the app first: bun run dev -- --host 127.0.0.1'
	);
	process.exit(1);
}
if (health.ok !== true) {
	console.error(`Health check failed at ${base}/api/fill-form: ${JSON.stringify(health)}`);
	process.exit(1);
}
const selected = args.limit ? cases.slice(0, Number(args.limit)) : cases;
console.log(`eval: ${selected.length} case(s) against ${base} (${provider})\n`);

for (const testCase of selected) {
	try {
		const result = await runWithRetry(testCase);
		caseResults.push(result);
		const bad = result.fields.filter((f) => f.status !== 'correct');
		const mark = bad.length === 0 ? 'ok  ' : 'FAIL';
		console.log(
			`  ${mark} ${result.id.padEnd(28)} ${result.fields.length - bad.length}/${result.fields.length}`
		);
		for (const f of bad) {
			console.log(
				`        ${f.status.padEnd(8)} ${f.id}: expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.actual)}`
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`  ERR  ${testCase.id}: ${message}`);
		caseResults.push({
			id: testCase.id,
			split: testCase.split ?? 'tuning',
			category: testCase.category ?? 'ordinary',
			error: message,
			fields: []
		});
	}
}

const metrics = summarise(caseResults);
const runErrors = caseResults.filter((c) => c.error).map((c) => ({ id: c.id, error: c.error }));
const results = {
	generatedAt: new Date().toISOString(),
	base,
	provider,
	cases: caseResults,
	runErrors,
	...metrics
};

await Bun.write(outFile, JSON.stringify(results, null, 2) + '\n');

const pct = (n) => `${(n * 100).toFixed(1)}%`;
console.log('');
for (const [name, s] of Object.entries(metrics.splits)) {
	console.log(`  ${name.padEnd(10)} ${s.correct}/${s.total} fields (${pct(s.accuracy)})`);
}
console.log(`  invented   ${metrics.invented.count} (must be 0)`);
console.log(`  run errors ${runErrors.length}`);
console.log(`  written to ${outFile}`);
if (metrics.overall.total < 100) {
	console.log(
		`\n  note: ${metrics.overall.total} scored fields — a percentage over a handful of fields is not evidence yet.`
	);
}

if (runErrors.length > 0) process.exit(1);
