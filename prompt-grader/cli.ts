#!/usr/bin/env bun
/**
 * prompt-grader — one command to scaffold and gate a Promptfoo eval for any
 * prompt or function, using the same pyramid-first shape built for 1.06.
 *
 *   prompt-grader init <name> [--mode prompt|function] [--dir <path>]
 *                             [--schema <path>] [--import <path>] [--export <name>]
 *   prompt-grader check [dir] [--threshold 0.9] [--out results.json]
 *   prompt-grader gate <resultsFile> [--threshold 0.9]
 *   prompt-grader view [dir]
 *
 * "check" is the one-command wrapper: eval + gate, same as 1.06's
 * `bun run check`, generalized to any directory that has a promptfoo.yaml.
 */
import { scaffold, type Mode } from "./lib/scaffold";
import { runGate } from "./lib/gate";

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function runCmd(cmd: string[], cwd: string): Promise<number> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit", stdin: "inherit" });
  return await proc.exited;
}

async function cmdInit(args: string[]) {
  const { positional, flags } = parseFlags(args);
  const name = positional[0];
  if (!name) {
    console.error("usage: prompt-grader init <name> [--mode prompt|function] [--dir <path>] [--schema <path>] [--import <path>] [--export <name>]");
    process.exit(1);
  }
  const mode = (flags.mode as Mode) ?? "prompt";
  if (mode !== "prompt" && mode !== "function") {
    console.error(`--mode must be "prompt" or "function", got "${mode}"`);
    process.exit(1);
  }
  const dir = flags.dir ?? name;

  const files = scaffold({
    name,
    mode,
    dir,
    schemaFile: flags.schema,
    importPath: flags.import,
    exportName: flags.export,
  });

  await Bun.write(`${dir}/.gitkeep`, ""); // ensure dir exists even if every file below is skipped
  for (const f of files) {
    const path = `${dir}/${f.path}`;
    const exists = await Bun.file(path).exists();
    if (exists && f.skipIfExists) {
      console.log(`skip   ${path} (already exists)`);
      continue;
    }
    await Bun.write(path, f.content);
    console.log(`write  ${path}`);
  }

  console.log(`\n${name} scaffolded in ${mode} mode at ./${dir}`);
  console.log(`Next: fill in ${dir}/tests/golden.yaml (~20 cases), then:`);
  console.log(`  bunx prompt-grader check ${dir}`);
}

async function cmdCheck(args: string[]) {
  const { positional, flags } = parseFlags(args);
  const dir = positional[0] ?? ".";
  const threshold = Number(flags.threshold ?? "0.9");
  const out = flags.out ?? "results.json";

  console.log(`→ promptfoo eval in ${dir}`);
  const evalCode = await runCmd(["bunx", "promptfoo", "eval", "-c", "promptfoo.yaml", "-o", out], dir);
  if (evalCode !== 0) {
    console.error(`promptfoo eval exited ${evalCode}`);
    process.exit(evalCode);
  }

  const result = await runGate({ resultsFile: `${dir}/${out}`, threshold });
  process.exit(result.ok ? 0 : 1);
}

async function cmdGate(args: string[]) {
  const { positional, flags } = parseFlags(args);
  const resultsFile = positional[0];
  if (!resultsFile) {
    console.error("usage: prompt-grader gate <resultsFile> [--threshold 0.9]");
    process.exit(1);
  }
  const threshold = Number(flags.threshold ?? "0.9");
  const result = await runGate({ resultsFile, threshold });
  process.exit(result.ok ? 0 : 1);
}

async function cmdView(args: string[]) {
  const { positional } = parseFlags(args);
  const dir = positional[0] ?? ".";
  const code = await runCmd(["bunx", "promptfoo", "view"], dir);
  process.exit(code);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "init":
      return cmdInit(rest);
    case "check":
      return cmdCheck(rest);
    case "gate":
      return cmdGate(rest);
    case "view":
      return cmdView(rest);
    default:
      console.log(`prompt-grader — opinionated Promptfoo scaffolding + CI gate, one command.

Usage:
  prompt-grader init <name> [--mode prompt|function] [--dir <path>] [--schema <path>] [--import <path>] [--export <name>]
  prompt-grader check [dir] [--threshold 0.9] [--out results.json]
  prompt-grader gate <resultsFile> [--threshold 0.9]
  prompt-grader view [dir]
`);
      process.exit(cmd ? 1 : 0);
  }
}

main();
