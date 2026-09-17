# prompt-grader

Opinionated Promptfoo config templates + a wrapper CLI, so every eval in this
repo (and every future one — 2.11's faithfulness triples, 3.12's agent
scenarios) starts from the same pyramid-first shape 1.06 built by hand,
instead of a blank `promptfoo.yaml` and a reinvented gate script.

## Install

Nothing to install — it's a local package in this repo.

```bash
cd prompt-grader && bun install
```

## Usage

```bash
# Scaffold a new eval around a bare prompt (default mode)
bun run cli.ts init my-eval --schema ../1.06/schema.json

# Scaffold one around a real function, e.g. an extractor like 1.05's
bun run cli.ts init standup-v2 --mode function --import ../1.05/extract --export extractStandup

# Fill in <dir>/tests/golden.yaml (~20 cases, see 1.06 for the worked example), then:
bun run cli.ts check my-eval           # eval + gate in one command
bun run cli.ts check my-eval --threshold 0.85
bun run cli.ts view my-eval            # promptfoo's web viewer
```

Once linked (`bun link` from this folder, or added as a workspace package),
the same commands run as `prompt-grader init ...` / `prompt-grader check ...`
from anywhere in the repo.

## What "opinionated" means here

`init` doesn't hand you an empty file — it hands you:

- `promptfoo.yaml` with the pyramid already wired: deterministic assertions
  (`is-json` against a schema, if you gave one) in `defaultTest` so they run
  free on every case, and a judge model for `llm-rubric` pinned to a
  **different** model family than whatever's under test — see
  [1.06/README.md](../1.06/README.md) for why that pairing matters
  (self-preference bias).
- `tests/golden.yaml` stubbed with the same rules 1.06 was built on: one
  behavior per case, hard negatives compulsory, pin anything that reads the
  clock, and the correct `javascript` assertion return shape
  (`{ pass: false, score: 0, reason: "..." }`, never a bare string —
  promptfoo throws instead of failing cleanly on a bare string return).
- In function mode, `provider.ts` that routes through your real function
  instead of a raw model call, so your schema/retry logic/pinning is what's
  actually under test — not just the prompt string.

## Two modes

| Mode | When to use it | What gets scaffolded |
|---|---|---|
| `prompt` (default) | The unit under test is a prompt template | `promptfoo.yaml`, `prompt.txt` |
| `function` | The unit under test is a real function (schema, retries, pinning included) | `promptfoo.yaml`, `provider.ts` |

`function` mode's `provider.ts` is scaffolded with a generic
`(vars) => result` call signature — it will not match your function's real
signature out of the box (see 1.06's `provider.ts` for a hand-tuned example
with a `(text, { today })` signature). Edit it before running anything.

## Commands

- `init <name>` — scaffold a new eval directory. Never overwrites
  `tests/golden.yaml` or `README.md` if they already exist.
- `check [dir]` — `promptfoo eval` then the gate, one command. Exits non-zero
  under threshold (default 0.9), same contract as CI expects.
- `gate <resultsFile>` — just the threshold check, for wiring into a
  differently-shaped pipeline.
- `view [dir]` — opens promptfoo's web viewer for per-case diffs.

## Known limitations

- `check`/`view` shell out via `bunx promptfoo`, so the target directory (or
  this repo) needs `promptfoo` resolvable — see `package.json`.
- Not yet published to npm; it's a local package, per issue PER-33's actual
  need (every eval in *this* repo reusing one CLI). Publishing is a separate
  step if it's ever needed outside this repo.
