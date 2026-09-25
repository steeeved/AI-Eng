#!/usr/bin/env node
/**
 * Post-deploy smoke test. Run it against a Vercel URL:
 *
 *   node scripts/smoke.mjs https://formfill-xyz.vercel.app
 *
 * Set EXPECT_REAL=1 once the openai provider ships — the run then fails if
 * production is still answering with the mock. That single assertion is what
 * stops a mock reaching a client.
 */
import cases from '../src/lib/fixtures/cases.json' with { type: 'json' };

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const expectReal = process.env.EXPECT_REAL === '1';
const failures = [];

function check(name, condition, detail = '') {
	if (condition) {
		console.log(`  ok   ${name}`);
	} else {
		console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
		failures.push(name);
	}
}

console.log(`smoke: ${base}\n`);

// 1. Health
const health = await fetch(`${base}/api/fill-form`).then((r) => r.json());
check('GET /api/fill-form responds', health.ok === true, JSON.stringify(health));
console.log(`  ->   provider: ${health.provider}`);

// 2. Contract rejection
const bad = await fetch(`${base}/api/fill-form`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ fields: [], source: '' })
});
check('invalid body is rejected with 422', bad.status === 422, `got ${bad.status}`);

// 1.09 turned /api/fill-form into an SSE stream: a sequence of `data: {...}`
// frames ending in exactly one of result/error/cancelled. This reads that
// stream to completion and returns the terminal event plus how many
// progress/preview ticks it saw along the way.
async function readStream(res) {
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let ticks = 0;
	let terminal = null;

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
			if (event.type === 'progress' || event.type === 'preview') {
				ticks++;
			} else {
				terminal = event;
			}
		}
	}
	return { terminal, ticks };
}

// 3. Happy path, one request per fixture case
for (const testCase of cases) {
	const res = await fetch(`${base}/api/fill-form`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(testCase.request)
	});

	check(`${testCase.id}: 200 (stream opened)`, res.status === 200, `got ${res.status}`);
	if (res.status !== 200) continue;

	const { terminal, ticks } = await readStream(res);
	check(`${testCase.id}: stream sent progress/preview ticks`, ticks > 0, `got ${ticks}`);
	check(`${testCase.id}: stream ended in a 'result' event`, terminal?.type === 'result', `got ${terminal?.type}`);
	if (terminal?.type !== 'result') continue;
	const body = terminal.data;

	check(
		`${testCase.id}: returns every requested field`,
		body.fields?.length === testCase.request.fields.length
	);
	check(`${testCase.id}: meta.latencyMs present`, typeof body.meta?.latencyMs === 'number');

	if (expectReal) {
		check(`${testCase.id}: NOT the mock`, body.meta?.mock === false, `meta.mock=${body.meta?.mock}`);
	}

	// Accuracy is reported, not asserted — the mock is expected to lose on the
	// unlabelled case. This number is the baseline the real provider must beat.
	const hits = body.fields.filter(
		(f) => testCase.expected[f.id] !== undefined && f.value === testCase.expected[f.id]
	).length;
	const total = Object.keys(testCase.expected).length;
	console.log(`  ->   ${testCase.id} exact-match: ${hits}/${total}`);
}

console.log('');
if (failures.length) {
	console.error(`FAILED (${failures.length}): ${failures.join(', ')}`);
	process.exit(1);
}
console.log('all checks passed');
