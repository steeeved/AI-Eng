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
const FLOOR = 50; // structure arm only; last chunk of a document may be shorter
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

async function readPart(path: string, part: string): Promise<string> {
  const p = Bun.spawn(["unzip", "-p", path, part], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`unzip failed for ${path}:${part}: ${err.trim()}`);
  return out;
}

// Word list labels ("(i)", "2.1", "a)") are auto-numbering: they exist only in numbering.xml,
// not in w:t runs, so they are rebuilt here from numPr + counters. Bullets and "none" get no label.
type Lvl = { start: number; fmt: string; text: string };
type Numbering = {
  levels: Map<string, Map<number, Lvl>>;
  nums: Map<string, { abs: string; starts: Map<number, number> }>;
  styleNum: Map<string, { numId: string; ilvl: number }>;
};

function parseNumbering(numXml: string, stylesXml: string): Numbering {
  const levels = new Map<string, Map<number, Lvl>>();
  for (const a of numXml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const lv = new Map<number, Lvl>();
    for (const l of a[2]!.matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      lv.set(Number(l[1]), {
        start: Number(l[2]!.match(/<w:start w:val="(-?\d+)"/)?.[1] ?? 1),
        fmt: l[2]!.match(/<w:numFmt w:val="([^"]+)"/)?.[1] ?? "decimal",
        text: decode(l[2]!.match(/<w:lvlText w:val="([^"]*)"/)?.[1] ?? ""),
      });
    }
    levels.set(a[1]!, lv);
  }
  const nums = new Map<string, { abs: string; starts: Map<number, number> }>();
  for (const n of numXml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const starts = new Map<number, number>();
    for (const o of n[2]!.matchAll(/<w:lvlOverride\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvlOverride>/g)) {
      const s = o[2]!.match(/<w:startOverride w:val="(-?\d+)"/)?.[1];
      if (s !== undefined) starts.set(Number(o[1]), Number(s));
    }
    nums.set(n[1]!, { abs: n[2]!.match(/<w:abstractNumId w:val="(\d+)"/)?.[1] ?? "", starts });
  }
  const styleNum = new Map<string, { numId: string; ilvl: number }>();
  for (const s of stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const np = s[2]!.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/)?.[1];
    const numId = np?.match(/<w:numId w:val="(\d+)"/)?.[1];
    if (numId) styleNum.set(s[1]!, { numId, ilvl: Number(np!.match(/<w:ilvl w:val="(\d+)"/)?.[1] ?? 0) });
  }
  return { levels, nums, styleNum };
}

function formatCounter(n: number, fmt: string): string {
  const letters = (k: number, base: number) => String.fromCharCode(base + ((k - 1) % 26)).repeat(Math.ceil(k / 26));
  const roman = (k: number) => {
    let out = "";
    for (const [v, s] of [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]] as const) {
      while (k >= v) { out += s; k -= v; }
    }
    return out;
  };
  if (fmt === "lowerLetter") return letters(n, 97);
  if (fmt === "upperLetter") return letters(n, 65);
  if (fmt === "lowerRoman") return roman(n);
  if (fmt === "upperRoman") return roman(n).toUpperCase();
  return String(n);
}

function extract(docId: string, xml: string, numbering: Numbering): Corpus {
  const paras: Para[] = [];
  let text = "";
  const counters = new Map<string, (number | undefined)[]>();
  for (const m of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const body = m[1]!;
    const style = body.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    let raw = "";
    for (const t of body.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
      raw += t[1] !== undefined ? decode(t[1]) : " ";
    }
    let label = "";
    const np = body.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/)?.[1];
    const fromStyle = np === undefined ? numbering.styleNum.get(style) : undefined;
    const numId = np ? np.match(/<w:numId w:val="(\d+)"/)?.[1] : fromStyle?.numId;
    const ilvl = np ? Number(np.match(/<w:ilvl w:val="(\d+)"/)?.[1] ?? 0) : (fromStyle?.ilvl ?? 0);
    const num = numId && numId !== "0" ? numbering.nums.get(numId) : undefined;
    const lv = num ? numbering.levels.get(num.abs) : undefined;
    if (num && lv?.get(ilvl)) {
      // lists that restart via startOverride keep their own sequence; others continue per abstract list
      const key = num.starts.size ? `n${numId}` : `a${num.abs}`;
      const cs = counters.get(key) ?? [];
      counters.set(key, cs);
      cs[ilvl] = cs[ilvl] === undefined ? (num.starts.get(ilvl) ?? lv.get(ilvl)!.start) : cs[ilvl]! + 1;
      for (let j = ilvl + 1; j < 9; j++) cs[j] = undefined;
      const def = lv.get(ilvl)!;
      if (def.fmt !== "bullet" && def.fmt !== "none" && /%\d/.test(def.text)) {
        label = def.text.replace(/%(\d)/g, (_, k) => {
          const d = lv.get(Number(k) - 1);
          return formatCounter(cs[Number(k) - 1] ?? d?.start ?? 1, d?.fmt ?? "decimal");
        });
      }
    }
    const clean = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (text) text += "\n\n";
    const start = text.length;
    text += label && clean ? `${label.normalize("NFKC").trim()} ${clean}` : clean;
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

type Item = { range: Range; path: string; prefix: string };

// Chunks under FLOOR proxy tokens merge into the following chunk (heading-only and short blocks),
// never above CAP. The last chunk of a document may stay short.
function mergeShort(text: string, items: Item[]): Item[] {
  const out: Item[] = [];
  let pending: Item | null = null;
  const tok = (r: Range) => countTokens(text.slice(r[0], r[1]));
  items.forEach((item, i) => {
    let cur = item;
    if (pending) {
      const joined: Range = [pending.range[0], item.range[1]];
      if (tok(joined) <= CAP) cur = { range: joined, path: item.path, prefix: pending.prefix };
      else out.push(pending);
      pending = null;
    }
    if (tok(cur.range) < FLOOR && i < items.length - 1) pending = cur;
    else out.push(cur);
  });
  if (pending) out.push(pending);
  return out;
}

function structureChunks(c: Corpus): Chunk[] {
  const items: Item[] = [];
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
  return toChunks("structure", c, mergeShort(c.text, items));
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

type Occurrence = { start: number; end: number };

// All occurrences of the quote in the document: a retrieved chunk is a hit if it overlaps ANY of them.
function locate(c: Corpus, quote: string): { occurrences: Occurrence[]; method: string } | null {
  const q = quote.normalize("NFKC");
  for (const alnum of [false, true]) {
    const { out, map } = collapse(c.text, alnum);
    const needle = collapse(q, alnum).out.trim();
    if (!needle) continue;
    const occurrences: Occurrence[] = [];
    for (let at = out.indexOf(needle); at >= 0; at = out.indexOf(needle, at + needle.length)) {
      occurrences.push({ start: map[at]!, end: map[at + needle.length - 1]! + 1 });
    }
    if (occurrences.length) return { occurrences, method: alnum ? "alnum" : "exact" };
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
for (const d of manifest.documents) {
  const path = resolve(projectDir, d.localPath);
  const [xml, numXml, stylesXml] = await Promise.all([
    readPart(path, "word/document.xml"), readPart(path, "word/numbering.xml"), readPart(path, "word/styles.xml"),
  ]);
  corpora.push(extract(d.id, xml, parseNumbering(numXml, stylesXml)));
}
const byId = new Map(corpora.map((c) => [c.docId, c]));

const dev = dataset.questions.filter((q: any) => q.split === "development" && q.answerable);
type Span = { questionId: string; evidenceIndex: number; docId: string; method: string; occurrences: Occurrence[] };
const spans: Span[] = [];
const unlocated: string[] = [];
for (const q of dev) {
  q.evidence.forEach((ev: any, evidenceIndex: number) => {
    const hit = locate(byId.get(ev.documentId)!, ev.quote);
    if (hit) spans.push({ questionId: q.id, evidenceIndex, docId: ev.documentId, ...hit });
    else unlocated.push(q.id);
  });
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
  ` | multi-occurrence: ${spans.filter((s) => s.occurrences.length > 1).map((s) => `${s.questionId}#${s.evidenceIndex}x${s.occurrences.length}`).join(", ") || "none"}`);

const overlaps = (c: Chunk, s: Span) =>
  c.docId === s.docId && s.occurrences.some((o) => o.start < c.charEnd && c.charStart < o.end);

// ---- boundary review (written for offscreen review, never printed) ----
function boundaryReview(arm: string, chunks: Chunk[]): string {
  const pick = new Set<number>();
  const gold = chunks.map((c, i) => (spans.some((s) => overlaps(c, s)) ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < Math.min(4, gold.length); k++) pick.add(gold[Math.floor((k * gold.length) / Math.min(4, gold.length))]!);
  for (let k = 0; pick.size < Math.min(10, chunks.length); k++) pick.add(Math.floor(((k + 0.5) * chunks.length) / 10));
  const lines = [`## ${arm}`, ""];
  for (const i of [...pick].sort((a, b) => a - b)) {
    const c = chunks[i]!;
    const prev = chunks[i - 1]?.docId === c.docId ? chunks[i - 1] : undefined;
    const goldFor = spans.filter((s) => overlaps(c, s)).map((s) => `${s.questionId}#${s.evidenceIndex}`);
    lines.push(`### ${c.id} | ${c.tokenCount} tokens | chars ${c.charStart}-${c.charEnd}${goldFor.length ? ` | gold: ${goldFor.join(", ")}` : ""}`,
      `heading path: ${c.headingPath || "(none)"}`, "",
      `previous chunk ends: ${prev ? `…${prev.text.slice(-200)}` : "(document start)"}`, "",
      `this chunk starts: ${c.text.slice(0, 300)}`, "",
      `this chunk ends: …${c.text.slice(-300)}`, "", "---", "");
  }
  return lines.join("\n");
}

const reviews: string[] = ["# Boundary review (local, gitignored)", ""];
for (const [arm, chunks] of Object.entries(arms)) {
  writeFileSync(join(outDir, `${arm}-512.json`), JSON.stringify({ arm, cap: CAP, datasetChecksum: checksum, chunks }));
  reviews.push(boundaryReview(arm, chunks));
  const tok = chunks.map((c) => c.tokenCount);
  const embedTok = chunks.reduce((n, c) => n + countTokens(c.embedText), 0);
  const split = spans.filter((s) => s.occurrences.some((o) =>
    chunks.filter((c) => c.docId === s.docId && o.start < c.charEnd && c.charStart < o.end).length > 1));
  const lastOfDoc = chunks.filter((c, i) => chunks[i + 1]?.docId !== c.docId).length;
  console.log(`\n[${arm}] chunks ${chunks.length} | text tokens ${tok.reduce((a, b) => a + b, 0)} | embed tokens ${embedTok}`);
  console.log(`  size min/p10/median/max: ${Math.min(...tok)}/${[...tok].sort((a, b) => a - b)[Math.floor(tok.length * 0.1)]}/${median(tok)}/${Math.max(...tok)} | under ${FLOOR} tokens: ${tok.filter((t) => t < FLOOR).length} (last-of-doc chunks: ${lastOfDoc})`);
  console.log(`  gold spans split across chunks (any occurrence): ${split.length}/${spans.length}${split.length ? ` (${split.map((s) => `${s.questionId}#${s.evidenceIndex}`).join(", ")})` : ""}`);
  console.log(`  est. cost $${((embedTok * PRICE_PER_M_USD) / 1e6).toFixed(4)} (proxy tokens) | at ${REDUCED_TPM} tokens/min: ~${Math.ceil(embedTok / REDUCED_TPM)} min`);
}
writeFileSync(join(outDir, "boundary-review.md"), reviews.join("\n"));
console.log("\nboundary samples written to .cache/chunks/boundary-review.md");
