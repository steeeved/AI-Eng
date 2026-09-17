/**
 * Opinionated Promptfoo config templates.
 *
 * Both modes encode the same pyramid built for 1.06: deterministic assertions
 * in defaultTest (free, run on every case), llm-rubric reserved for what
 * determinism can't reach, a golden-set stub with the same coverage
 * checklist and hard-negative rule, and a judge model pinned separately from
 * whatever's under test. Nobody hand-writes this shape from scratch again —
 * that consistency is the actual point of prompt-grader existing.
 */

export type Mode = "prompt" | "function";

export interface ScaffoldOptions {
  name: string;
  mode: Mode;
  dir: string;
  /** function mode: import path to the module under test, relative to dir. */
  importPath?: string;
  /** function mode: named export to wrap. Defaults to a default export. */
  exportName?: string;
  /** Either mode: path to a JSON schema for the is-json base assertion. */
  schemaFile?: string;
  /** prompt mode: path to the prompt file/template. */
  promptFile?: string;
}

export interface ScaffoldFile {
  path: string; // relative to dir
  content: string;
  /** Skip writing if the file already exists (never clobber golden cases). */
  skipIfExists?: boolean;
}

const JUDGE_MODEL = "anthropic:messages:claude-haiku-4-5-20251001";

function goldenStub(name: string, varNames: string[]): string {
  const varsBlock = varNames.map((v) => `    ${v}: "<value>"`).join("\n");
  return `# ─────────────────────────────────────────────────────────────────────────────
# GOLDEN SET — ${name}
#
# You write these. See 1.06/tests/golden.yaml for a worked example.
#
# Rules that keep a golden set worth having:
#   1. One behavior per case. If a case fails you must know why without
#      reading it.
#   2. Realistic messy input. Clean prose passes everything and proves
#      nothing.
#   3. Hard negatives are compulsory — input that looks actionable and isn't.
#      A set where everything passes measures nothing.
#   4. Pin anything that reads the clock (today's date, etc.) in vars.
#   5. Assert only what defaultTest doesn't already cover (see promptfoo.yaml)
#      — don't restate is-json or schema checks per case.
#   6. A javascript assertion returns \`true\`, or
#      \`{ pass: false, score: 0, reason: "..." }\` — never a bare string.
#      Promptfoo throws on a bare string return instead of failing cleanly.
#
# Aim for ~20 cases before wiring this into a CI gate.
# ─────────────────────────────────────────────────────────────────────────────

- description: "<one behavior, stated as the thing that must be true>"
  vars:
${varsBlock || '    text: "<input>"'}
  assert:
    - type: javascript
      value: |
        // return true, or { pass: false, score: 0, reason: "..." }
        return true;
`;
}

function readmeContent(name: string, mode: Mode): string {
  return `# ${name} — eval harness

Scaffolded by \`prompt-grader init\`. Fill in \`tests/golden.yaml\` (aim for ~20
cases, see 1.06 for the worked example), then:

\`\`\`bash
bunx prompt-grader check ${name}     # eval + gate, one command
bunx prompt-grader view ${name}      # promptfoo's web viewer, per-case diffs
\`\`\`

Mode: **${mode}**. ${
    mode === "function"
      ? "The unit under test is a real function (provider.ts), not a bare prompt — edit provider.ts if the call signature doesn't match your function yet."
      : "The unit under test is the prompt template itself, called directly."
  }
`;
}

export function scaffold(opts: ScaffoldOptions): ScaffoldFile[] {
  const { name, mode, schemaFile } = opts;
  const files: ScaffoldFile[] = [];

  const baseAssert = schemaFile
    ? `    - type: is-json
      value: file://${schemaFile}`
    : `    # No schema given, so this only checks the output parses as JSON —
    # still free and still catches most real failures. Re-run
    # \`prompt-grader init\` with --schema <path> to also check shape
    # (required fields, enums in range, no extra keys).
    - type: is-json`;

  if (mode === "prompt") {
    const promptFile = opts.promptFile ?? "prompt.txt";
    files.push({
      path: promptFile,
      content: `You are ...\n\n{{input}}\n`,
      skipIfExists: true,
    });
    files.push({
      path: "promptfoo.yaml",
      content: `description: "${name} — golden set"

# Point this at the real model under test. Swap freely — the harness doesn't
# care what's under it, that's the point of testing the prompt, not the vendor.
providers:
  - anthropic:messages:claude-sonnet-4-5

prompts:
  - file://${promptFile}

tests: file://tests/golden.yaml

defaultTest:
  # ── Base of the pyramid — free, deterministic, runs on every case ─────────
  assert:
${baseAssert}

  options:
    # Judge model for any llm-rubric assertions. Deliberately not the same
    # model as the one under test — see 1.06/README.md's self-preference-bias
    # note for why that pairing is a documented anti-pattern.
    provider: ${JUDGE_MODEL}
`,
    });
  } else {
    const importPath = opts.importPath ?? "../src/index";
    const exportName = opts.exportName ?? "run";
    files.push({
      path: "provider.ts",
      content: `/**
 * Promptfoo custom provider: routes each test case through the real
 * ${exportName}() rather than through a raw model call, so the schema, retry
 * logic, and any pinning around it are actually under test — see 1.06's
 * provider.ts for the rationale.
 *
 * Scaffolded with a generic (vars) => result signature. Edit this to match
 * ${exportName}'s real signature before running anything.
 */
import { ${exportName} } from "${importPath}";

interface CallContext {
  vars?: Record<string, unknown>;
}

export default class Provider {
  id() {
    return "${name}";
  }

  async callApi(prompt: string, context?: CallContext) {
    const vars = context?.vars ?? {};
    try {
      const result = await ${exportName}(vars);
      return { output: typeof result === "string" ? result : JSON.stringify(result) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
`,
    });
    files.push({
      path: "promptfoo.yaml",
      content: `description: "${name} — golden set"

# The provider reads vars directly; promptfoo still requires a prompt template.
providers:
  - id: file://provider.ts
    label: ${name}

prompts:
  - "{{text}}"

tests: file://tests/golden.yaml

defaultTest:
  # ── Base of the pyramid — free, deterministic, runs on every case ─────────
  assert:
${baseAssert}

  options:
    # Judge model for any llm-rubric assertions — kept off the model under
    # test. See 1.06/README.md's self-preference-bias note.
    provider: ${JUDGE_MODEL}
`,
    });
  }

  files.push({
    path: "tests/golden.yaml",
    content: goldenStub(name, mode === "function" ? ["today", "text"] : ["input"]),
    skipIfExists: true,
  });

  files.push({ path: "README.md", content: readmeContent(name, mode), skipIfExists: true });

  return files;
}
