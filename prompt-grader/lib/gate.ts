/**
 * Generalized CI gate — the part of 1.06 that is actually reusable.
 *
 * Reads a promptfoo results.json and decides pass/fail against a threshold.
 * Deliberately not a promptfoo feature: "the deploy fails automatically below
 * N%" is the thing a client is buying, and it should survive swapping the
 * eval runner. This is the same logic as 1.06/scripts/gate.ts, extracted so
 * every future day (2.11's faithfulness triples, 3.12's agent scenarios,
 * 1.07 and on) calls one implementation instead of copy-pasting it.
 */

export interface GateOptions {
  resultsFile: string;
  threshold: number;
  /** Written next to resultsFile unless overridden. Set to null to skip. */
  badgeFile?: string | null;
  /** Warn (not fail) if the golden set is smaller than this. */
  minCases?: number;
}

export interface GateResult {
  passed: number;
  total: number;
  rate: number;
  ok: boolean;
}

// promptfoo has moved the results shape between versions; look in the known
// places before falling back to counting rows.
function tally(doc: any): { passed: number; total: number } {
  const stats = doc?.results?.stats ?? doc?.stats;
  if (stats && typeof stats.successes === "number") {
    return { passed: stats.successes, total: stats.successes + (stats.failures ?? 0) };
  }
  const rows: any[] = doc?.results?.results ?? doc?.results ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Could not read results from the file — promptfoo output shape changed.`);
  }
  return { passed: rows.filter((r) => r.success).length, total: rows.length };
}

export async function runGate(opts: GateOptions): Promise<GateResult> {
  const { resultsFile, threshold, minCases = 20 } = opts;
  const badgeFile =
    opts.badgeFile === null
      ? null
      : opts.badgeFile ?? resultsFile.replace(/results\.json$/, "eval-badge.json");

  const raw = JSON.parse(await Bun.file(resultsFile).text());
  const { passed, total } = tally(raw);
  const rate = total === 0 ? 0 : passed / total;
  const pct = (rate * 100).toFixed(1);

  console.log(`eval: ${passed}/${total} passed (${pct}%) — threshold ${(threshold * 100).toFixed(0)}%`);

  if (badgeFile) {
    await Bun.write(
      badgeFile,
      JSON.stringify({
        schemaVersion: 1,
        label: "eval",
        message: `${pct}%`,
        color: rate >= threshold ? "brightgreen" : "red",
      }) + "\n",
    );
  }

  if (total < minCases) {
    console.warn(`⚠️  only ${total} cases — aim for at least ${minCases}. A 100% rate on a handful of cases is not evidence.`);
  }

  const ok = rate >= threshold;
  if (!ok) {
    console.error(`FAIL: ${pct}% is below the ${(threshold * 100).toFixed(0)}% gate.`);
  }

  return { passed, total, rate, ok };
}
