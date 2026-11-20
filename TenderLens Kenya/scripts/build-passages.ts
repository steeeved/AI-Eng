import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDir = join(projectDir, "..");
const questionsPath = join(projectDir, "questions.json");
const documentsPath = join(projectDir, "documents.json");
const outputPath = join(projectDir, "passages.generated.json");
const distractorSeed = "tenderlens-ke-v1|passages-v1";
const distractorsPerDocument = 12;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

function overlap(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const larger = smaller === leftTokens ? rightTokens : leftTokens;
  let shared = 0;
  for (const token of smaller) if (larger.has(token)) shared += 1;
  return smaller.size === 0 ? 0 : shared / smaller.size;
}

function isSubstantive(text: string): boolean {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const templateMarkers = text.match(/\[insert|_{3,}|\.{6,}/gi) ?? [];
  const sentenceMarks = text.match(/[.;!?]/g) ?? [];
  if (words.length < 30 || sentenceMarks.length === 0) return false;
  if (templateMarkers.length >= 2) return false;
  if (/PREFACE\s+iii\s+REQUEST FOR QUOTATIONS|Period Employing organization/i.test(text)) {
    return false;
  }
  return true;
}

async function extractDocxText(path: string): Promise<string> {
  const process = Bun.spawn(["textutil", "-convert", "txt", "-stdout", path], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(`textutil failed for ${path}: ${stderr.trim()}`);
  return stdout;
}

const dataset = JSON.parse(readFileSync(questionsPath, "utf8"));
const manifest = JSON.parse(readFileSync(documentsPath, "utf8"));

if (dataset.status !== "frozen") throw new Error("questions.json is not frozen");

const goldByKey = new Map<
  string,
  {
    id: string;
    kind: "gold";
    documentId: string;
    renderedPage: number;
    section: string;
    text: string;
    goldFor: string[];
  }
>();

for (const question of dataset.questions) {
  for (const evidence of question.evidence) {
    const text = normalize(evidence.quote);
    const key = sha256(
      `${evidence.documentId}|${evidence.renderedPage}|${evidence.section}|${text}`,
    );
    const existing = goldByKey.get(key);
    if (existing) {
      if (!existing.goldFor.includes(question.id)) existing.goldFor.push(question.id);
      continue;
    }
    goldByKey.set(key, {
      id: `gold-${key.slice(0, 16)}`,
      kind: "gold",
      documentId: evidence.documentId,
      renderedPage: evidence.renderedPage,
      section: evidence.section,
      text,
      goldFor: [question.id],
    });
  }
}

const goldPassages = [...goldByKey.values()];
const goldTexts = goldPassages.map(({ text }) => text);
const distractors: Array<{
  id: string;
  kind: "distractor";
  documentId: string;
  text: string;
}> = [];

for (const document of manifest.documents) {
  const localPath = resolve(projectDir, document.localPath);
  const rawText = await extractDocxText(localPath);
  const candidates = [...new Set(rawText.split(/\n\s*\n+/).map(normalize))]
    .filter((text) => text.length >= 180 && text.length <= 900)
    .filter(isSubstantive)
    .filter(
      (text) =>
        !goldTexts.some(
          (gold) => text.includes(gold) || gold.includes(text) || overlap(text, gold) >= 0.65,
        ),
    )
    .map((text) => ({
      id: `dist-${sha256(`${document.id}|${text}`).slice(0, 16)}`,
      kind: "distractor" as const,
      documentId: document.id,
      text,
      order: sha256(`${distractorSeed}|${document.id}|${text}`),
    }))
    .sort((left, right) => left.order.localeCompare(right.order));

  if (candidates.length < distractorsPerDocument) {
    throw new Error(
      `${document.id} produced ${candidates.length} distractors; need ${distractorsPerDocument}`,
    );
  }
  distractors.push(
    ...candidates.slice(0, distractorsPerDocument).map(({ order: _order, ...passage }) => passage),
  );
}

if (distractors.length < 50) throw new Error(`need at least 50 distractors, got ${distractors.length}`);

const passageSet = {
  schemaVersion: 1,
  datasetChecksum: readFileSync(join(projectDir, "questions.sha256"), "utf8").split(/\s+/)[0],
  generation: {
    method:
      "Gold evidence spans plus deterministic same-corpus DOCX paragraphs, excluding exact and high-overlap gold text.",
    seed: distractorSeed,
    distractorsPerDocument,
    publicationConstraint:
      "Private evaluation fixture. Do not publish until PPRA excerpt-display permission is confirmed.",
  },
  counts: {
    gold: goldPassages.length,
    distractors: distractors.length,
    total: goldPassages.length + distractors.length,
  },
  passages: [...goldPassages, ...distractors],
};

writeFileSync(outputPath, `${JSON.stringify(passageSet, null, 2)}\n`);
console.log(
  `Built ${passageSet.counts.total} passages: ${passageSet.counts.gold} gold, ${passageSet.counts.distractors} distractors.`,
);
