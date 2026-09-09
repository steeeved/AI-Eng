/**
 * CI gate: reads a promptfoo results file and exits non-zero below the threshold.
 *
 *   bun run scripts/gate.ts results.json 0.9
 *
 * This is deliberately not a promptfoo feature. The gate is the part a client is
 * buying — "the deploy fails automatically below 90%" — and it should survive you
 * swapping the eval runner. Twenty lines of your own code, no lock-in.
 */

const [file = "results.json", thresholdArg = "0.9"] = Bun.argv.slice(2);
const threshold = Number(thresholdArg);

const raw = JSON.parse(await Bun.file(file).text());

// promptfoo has moved this between versions; look in the known places before
// falling back to counting rows.
function tally(doc: any): { passed: number; total: number } {
  const stats = doc?.results?.stats ?? doc?.stats;
  if (stats && typeof stats.successes === "number") {
    return { passed: stats.successes, total: stats.successes + (stats.failures ?? 0) };
  }
  const rows: any[] = doc?.results?.results ?? doc?.results ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Could not read results from ${file} — promptfoo output shape changed.`);
  }
  return { passed: rows.filter((r) => r.success).length, total: rows.length };
}

const { passed, total } = tally(raw);
const rate = total === 0 ? 0 : passed / total;
const pct = (rate * 100).toFixed(1);

console.log(`eval: ${passed}/${total} passed (${pct}%) — threshold ${(threshold * 100).toFixed(0)}%`);

// Written for the README badge / job summary.
await Bun.write(
  "eval-badge.json",
  JSON.stringify({
    schemaVersion: 1,
    label: "eval",
    message: `${pct}%`,
    color: rate >= threshold ? "brightgreen" : "red",
  }) + "\n",
);

if (total < 20) {
  console.warn(`⚠️  only ${total} cases — the issue calls for 20. A 100% rate on 3 cases is not evidence.`);
}

if (rate < threshold) {
  console.error(`FAIL: ${pct}% is below the ${(threshold * 100).toFixed(0)}% gate.`);
  process.exit(1);
}
