#!/usr/bin/env bun
/**
 * CI gate for FormFill's golden set (1.10).
 *
 * Two thresholds, deliberately independent:
 *
 *   1. tuning-set field accuracy >= 95%
 *   2. invented values == 0, on every case
 *
 * The second is not a percentage and is not averaged with the first. A run at
 * 99% with one invented value fails. A clerk can fill a blank; nobody catches a
 * confident wrong number, so this error class gets zero tolerance whatever the
 * overall score says.
 *
 * The held-out split is printed but not gated. It exists to be reported
 * honestly, never tuned against — gating it would turn it into another tuning
 * set by another name.
 *
 *   bun run gate [results.json] [0.95]
 */
const [file = 'results.json', thresholdArg = '0.95'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const threshold = Number(thresholdArg);

const raw = JSON.parse(await Bun.file(file).text());
const tuning = raw.splits?.tuning ?? { correct: 0, total: 0, accuracy: 0 };
const heldOut = raw.splits?.['held-out'];
const invented = raw.invented?.count ?? 0;
const runErrors = raw.runErrors?.length ?? 0;

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const colour = tuning.accuracy >= threshold && invented === 0 && runErrors === 0 ? 'brightgreen' : 'red';

console.log(`FormFill eval (${file})`);
console.log(`  tuning      ${tuning.correct}/${tuning.total} fields (${pct(tuning.accuracy)}) — gate ${pct(threshold)}`);
if (heldOut) console.log(`  held-out    ${heldOut.correct}/${heldOut.total} fields (${pct(heldOut.accuracy)}) — reported, not gated`);
console.log(`  invented    ${invented} — gate 0`);
console.log(`  run errors  ${runErrors}`);

const failures = [];
if (runErrors > 0) failures.push(`${runErrors} case(s) did not return a result`);
if (invented > 0) failures.push(`${invented} invented value(s) on absent fields`);
if (tuning.total === 0) failures.push('no tuning cases were scored');
else if (tuning.accuracy < threshold) failures.push(`tuning accuracy ${pct(tuning.accuracy)} < ${pct(threshold)}`);

await Bun.write(
	'eval-badge.json',
	JSON.stringify({
		schemaVersion: 1,
		label: 'formfill eval',
		message: `${pct(tuning.accuracy)} tuning · ${invented} invented`,
		color: colour
	}) + '\n'
);

if (failures.length > 0) {
	for (const failure of failures) console.error(`FAIL: ${failure}`);
	process.exit(1);
}

console.log('gate passed');
