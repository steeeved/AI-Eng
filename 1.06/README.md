# 1.06 — Eval harness for the 1.05 standup extractor

[![eval](https://github.com/steeeved/AI-Eng/actions/workflows/eval.yml/badge.svg)](https://github.com/steeeved/AI-Eng/actions/workflows/eval.yml)

A golden set with a CI gate. The build fails below **90%** pass rate, so a prompt edit
or a model swap cannot silently degrade extraction.

## Run it

```bash
bun install
bun run check          # eval + gate
bun run view           # promptfoo web viewer, per-case diffs
bun run schema         # regenerate schema.json after a Zod schema change
```

`ANTHROPIC_API_KEY` is read from the repo root `.env`.

## Shape of the set

The unit under test is `extractStandup()` from 1.05 — not a prompt string. A prompt-only
eval would leave the schema, the retry loop and the date pinning untested.

Assertion mix, cheapest first:

| Layer | Assertion | Runs on | Catches |
|---|---|---|---|
| Deterministic | `is-json` against `schema.json` | every case | invalid JSON, missing fields, out-of-enum values, extra keys |
| Deterministic | ISO date check | every case | malformed or impossible `dueDate` |
| Deterministic | per-case `javascript` | most cases | the one behaviour that case exists to test |
| Judge | `llm-rubric` | 2–3 cases | faithfulness of free-text fields only |

The first two are free and catch most real failures, which is why they sit in
`defaultTest` rather than being restated per case. `llm-rubric` costs a model call and
carries the judge's own biases, so it is reserved for what determinism cannot reach.

`today` is pinned on every case. An extractor that reads the system clock cannot be
evaluated — every relative-deadline case would drift by the day you ran it.

## Known limitation — judge self-preference

The `llm-rubric` judge is the same model family as the extractor. That is the
configuration that produced a 10–25% self-inflated win rate in the MT-Bench study, so
these scores are optimistic by an unmeasured amount.

Mitigations applied: rubrics are **binary** (PASS/FAIL on a stated fact, not a quality
score), **reference-anchored** (the judge is told what the right answer contains), and
explicitly told to ignore length and style. Judge assertions are a small minority of the
set, so a biased judge cannot move the headline number much.

Not yet done: spot-checking judge verdicts against my own labels, and running the judge
on a second provider. Both are worth doing before quoting this pass rate to a client.
