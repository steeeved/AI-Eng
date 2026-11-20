// PER-92 step 1: build both chunking arms over the full corpus and report
// counts, token totals, cost/time estimate, and gold-span integrity.
// No network, no API calls. Writes only to gitignored .cache/chunks/.
// Prints question IDs and aggregate counts only, never passage text.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(projectDir, ".cache", "chunks");
const CAP = 512;
const TOKEN_RE = /[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu; // proxy tokenizer, calibrate against Voyage usage
const PRICE_PER_M_USD = 0.06;
const REDUCED_TPM = 10_000;

const countTokens = (t: string) => (t.match(TOKEN_RE) ?? []).length;
const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");

type Para = { start: number; end: number; heading: boolean; level: number; text: string };
type Corpus = { docId: string; text: string; paras: Para[] };
type Range = [number, number];
type Chunk = {
  id: string; docId: string; page: null; charStart: number; charEnd: number;
  headingPath: string; tokenCount: number; text: string; embedText: string;
};

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function readDocumentXml(path: string): Promise<string> {
  const p = Bun.spawn(["unzip", "-p", path, "word/document.xml"], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`unzip failed for ${path}: ${err.trim()}`);
  return out;
}

function extract(docId: string, xml: string): Corpus {
  const paras: Para[] = [];
  let text = "";
  for (const m of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const body = m[1]!;
    const style = body.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    let raw = "";
    for (const t of body.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
      raw += t[1] !== undefined ? decode(t[1]) : " ";
    }
    const clean = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (text) text += "\n\n";
    const start = text.length;
    text += clean;
    const heading = /heading/i.test(style) && !/^toc/i.test(style) && clean.length <= 200;
    const level = Number(style.match(/(\d)\s*$/)?.[1] ?? 1);
    paras.push({ start, end: text.length, heading, level, text: clean });
  }
  return { docId, text, paras };
}

function windowByTokens(text: string, s: number, e: number): Range[] {
  const idx = [...text.slice(s, e).matchAll(TOKEN_RE)].map((m) => m.index!);
  const out: Range[] = [];
  let from = 0;
  for (let k = CAP; k < idx.length; k += CAP) { out.push([s + from, s + idx[k]!]); from = idx[k]!; }
  out.push([s + from, e]);
  return out;
}

function splitRange(text: string, s: number, e: number, seps: string[]): Range[] {
  if (countTokens(text.slice(s, e)) <= CAP) return [[s, e]];
  const [sep, ...rest] = seps;
  if (sep === undefined) return windowByTokens(text, s, e);
  const pieces: Range[] = [];
  let from = s;
  for (;;) {
    const i = text.indexOf(sep, from);
    if (i < 0 || i + sep.length >= e) { pieces.push([from, e]); break; }
    pieces.push([from, i + sep.length]);
    from = i + sep.length;
  }
  if (pieces.length === 1) return splitRange(text, s, e, rest);
  return pieces.flatMap(([ps, pe]) =>
    countTokens(text.slice(ps, pe)) > CAP ? splitRange(text, ps, pe, rest) : [[ps, pe] as Range],
  );
}

function pack(text: string, ranges: Range[]): Range[] {
  const out: Range[] = [];
  let cur: Range | null = null;
  let curTok = 0;
  for (const [s, e] of ranges) {
    const t = countTokens(text.slice(s, e));
    if (cur && curTok + t <= CAP) { cur[1] = e; curTok += t; }
    else { if (cur) out.push(cur); cur = [s, e]; curTok = t; }
  }
  if (cur) out.push(cur);
  return out;
}

function trim(text: string, [s, e]: Range): Range {
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  return [s, e];
}

function toChunks(arm: string, c: Corpus, items: { range: Range; path: string; prefix: string }[]): Chunk[] {
  return items.map(({ range, path, prefix }, n) => {
    const [s, e] = trim(c.text, range);
    const text = c.text.slice(s, e);
    const tokenCount = countTokens(text);
    if (tokenCount > CAP) throw new Error(`${arm}:${c.docId}:${n} has ${tokenCount} proxy tokens, over cap ${CAP}`);
    return {
      id: `${arm}:${c.docId}:${n}`, docId: c.docId, page: null, charStart: s, charEnd: e,
      headingPath: path, tokenCount, text, embedText: prefix ? `${prefix}\n\n${text}` : text,
    };
  });
}

function baselineChunks(c: Corpus): Chunk[] {
  const ranges = pack(c.text, splitRange(c.text, 0, c.text.length, ["\n\n", "\n", ". ", " "]));
  return toChunks("baseline", c, ranges.map((range) => ({ range, path: "", prefix: "" })));
}

function structureChunks(c: Corpus): Chunk[] {
  const items: { range: Range; path: string; prefix: string }[] = [];
  const stack: { level: number; text: string }[] = [];
  let block: Para[] = [];
  let fullPath = "";
  let ancestors = "";
  let startsAtHeading = false;
  const flush = () => {
    if (!block.length) return;
    const ranges = block.flatMap((p) => splitRange(c.text, p.start, p.end, [". ", " "]));
    pack(c.text, ranges).forEach((range, i) =>
      items.push({ range, path: fullPath, prefix: i === 0 && startsAtHeading ? ancestors : fullPath }),
    );
    block = [];
  };
  for (const p of c.paras) {
    if (p.heading) {
      flush();
      while (stack.length && stack[stack.length - 1]!.level >= p.level) stack.pop();
      ancestors = stack.map((x) => x.text).join(" > ");
      stack.push({ level: p.level, text: p.text });
      fullPath = stack.map((x) => x.text).join(" > ");
      startsAtHeading = true;
    }
    block.push(p);
  }
  flush();
  return toChunks("structure", c, items);
}

// ---- gold spans (development, answerable only; held-out evidence is never read) ----
function collapse(text: string, alnumOnly: boolean) {
  let out = "";
  const map: number[] = [];
  let prevSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (alnumOnly) {
      if (/[\p{L}\p{N}]/u.test(ch)) { out += ch.toLowerCase(); map.push(i); }
    } else if (/\s/.test(ch)) {
      if (!prevSpace) { out += " "; map.push(i); prevSpace = true; }
    } else { out += ch; map.push(i); prevSpace = false; }
  }
  return { out, map };
}

function locate(c: Corpus, quote: string) {
  const q = quote.normalize("NFKC");
  for (const alnum of [false, true]) {
    const { out, map } = collapse(c.text, alnum);
    const needle = collapse(q, alnum).out.trim();
    if (!needle) continue;
    const first = out.indexOf(needle);
    if (first < 0) continue;
    const occurrences = out.indexOf(needle, first + 1) < 0 ? 1 : 2;
    return { start: map[first]!, end: map[first + needle.length - 1]! + 1, method: alnum ? "alnum" : "exact", occurrences };
  }
  return null;
}

// ---- run ----
const manifest = JSON.parse(readFileSync(join(projectDir, "documents.json"), "utf8"));
const dataset = JSON.parse(readFileSync(join(projectDir, "questions.json"), "utf8"));
const checksum = sha(readFileSync(join(projectDir, "questions.json"), "utf8"));
const expected = readFileSync(join(projectDir, "questions.sha256"), "utf8").split(/\s+/)[0];
if (checksum !== expected) throw new Error("questions.json does not match questions.sha256");

const corpora: Corpus[] = [];
for (const d of manifest.documents) corpora.push(extract(d.id, await readDocumentXml(resolve(projectDir, d.localPath))));
const byId = new Map(corpora.map((c) => [c.docId, c]));

const dev = dataset.questions.filter((q: any) => q.split === "development" && q.answerable);
const spans: { questionId: string; docId: string; start: number; end: number; method: string; occurrences: number }[] = [];
const unlocated: string[] = [];
for (const q of dev) {
  for (const ev of q.evidence) {
    const hit = locate(byId.get(ev.documentId)!, ev.quote);
    if (hit) spans.push({ questionId: q.id, docId: ev.documentId, ...hit });
    else unlocated.push(q.id);
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "gold-spans.json"), JSON.stringify({ datasetChecksum: checksum, spans, unlocated }, null, 2));

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
const arms = { baseline: corpora.flatMap(baselineChunks), structure: corpora.flatMap(structureChunks) };
const corpusTokens = corpora.reduce((n, c) => n + countTokens(c.text), 0);

console.log(`dataset ${checksum.slice(0, 8)}… ok | corpus ${corpora.length} docs, ${corpusTokens} proxy tokens, ${corpora.reduce((n, c) => n + c.text.length, 0)} chars`);
console.log(`gold spans located: ${spans.length}/${spans.length + unlocated.length}` +
  (unlocated.length ? ` | UNLOCATED: ${unlocated.join(", ")}` : "") +
  ` | alnum-fallback: ${spans.filter((s) => s.method === "alnum").map((s) => s.questionId).join(", ") || "none"}` +
  ` | ambiguous (>1 match): ${spans.filter((s) => s.occurrences > 1).map((s) => s.questionId).join(", ") || "none"}`);

for (const [arm, chunks] of Object.entries(arms)) {
  writeFileSync(join(outDir, `${arm}-512.json`), JSON.stringify({ arm, cap: CAP, datasetChecksum: checksum, chunks }));
  const tok = chunks.map((c) => c.tokenCount);
  const embedTok = chunks.reduce((n, c) => n + countTokens(c.embedText), 0);
  const overlapCount = (s: (typeof spans)[number]) =>
    chunks.filter((c) => c.docId === s.docId && s.start < c.charEnd && c.charStart < s.end).length;
  const split = spans.filter((s) => overlapCount(s) > 1);
  console.log(`\n[${arm}] chunks ${chunks.length} | text tokens ${tok.reduce((a, b) => a + b, 0)} | embed tokens ${embedTok}`);
  console.log(`  size min/p10/median/max: ${Math.min(...tok)}/${[...tok].sort((a, b) => a - b)[Math.floor(tok.length * 0.1)]}/${median(tok)}/${Math.max(...tok)} | under 50 tokens: ${tok.filter((t) => t < 50).length}`);
  console.log(`  gold spans split across chunks: ${split.length}/${spans.length}${split.length ? ` (${split.map((s) => s.questionId).join(", ")})` : ""}`);
  console.log(`  est. cost $${((embedTok * PRICE_PER_M_USD) / 1e6).toFixed(4)} (proxy tokens) | at ${REDUCED_TPM} tokens/min: ~${Math.ceil(embedTok / REDUCED_TPM)} min`);
}
