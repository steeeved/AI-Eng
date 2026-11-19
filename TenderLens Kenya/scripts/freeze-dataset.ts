import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const draftPath = join(projectDir, "questions.draft.json");
const frozenPath = join(projectDir, "questions.json");
const checksumPath = join(projectDir, "questions.sha256");

const splitSeed = "tenderlens-ke-v1|split-v1";
const heldOutQuotas = {
  "exact-term": 3,
  paraphrase: 3,
  "multi-passage": 1,
  unanswerable: 1,
} as const;

type QuestionType = keyof typeof heldOutQuotas;

type Evidence = {
  documentId: string;
  renderedPage: number | null;
  printedPage: string | null;
  section: string;
  quote: string;
  pageRendered: boolean;
  [key: string]: unknown;
};

type DraftQuestion = {
  id: string;
  type: QuestionType;
  question: string;
  answerable: boolean;
  referenceAnswerDraft: string | null;
  evidence: Evidence[];
  humanVerification: { status: string; notes: string | null };
  [key: string]: unknown;
};

type DraftDataset = {
  schemaVersion: number;
  createdAt: string;
  dataset: string;
  distribution: Record<string, number>;
  questions: DraftQuestion[];
};

function fail(message: string): never {
  throw new Error(`Dataset freeze blocked: ${message}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as DraftDataset;

if (draft.schemaVersion !== 2) fail(`expected schemaVersion 2, got ${draft.schemaVersion}`);
if (draft.questions.length !== 30) fail(`expected 30 questions, got ${draft.questions.length}`);

const ids = new Set(draft.questions.map(({ id }) => id));
if (ids.size !== draft.questions.length) fail("question IDs are not unique");

for (const question of draft.questions) {
  if (!(question.type in heldOutQuotas)) fail(`${question.id} has unknown type ${question.type}`);
  if (question.humanVerification.status !== "approved") {
    fail(`${question.id} is ${question.humanVerification.status}, not approved`);
  }
  if (question.answerable && question.evidence.length === 0) {
    fail(`${question.id} is answerable but has no evidence`);
  }
  if (!question.answerable && question.evidence.length !== 0) {
    fail(`${question.id} is unanswerable but has evidence labels`);
  }
  for (const evidence of question.evidence) {
    if (!Number.isInteger(evidence.renderedPage) || (evidence.renderedPage ?? 0) < 1) {
      fail(`${question.id} has no stable rendered page`);
    }
    if (!evidence.pageRendered) fail(`${question.id} has an unverified rendered page`);
    if (!evidence.documentId || !evidence.section || !evidence.quote) {
      fail(`${question.id} has an incomplete evidence label`);
    }
    if ("docxPageCandidate" in evidence || "pageCandidateMethod" in evidence) {
      fail(`${question.id} still contains a provisional DOCX locator`);
    }
  }
}

const heldOutIds = new Set<string>();
for (const [type, quota] of Object.entries(heldOutQuotas) as [QuestionType, number][]) {
  const candidates = draft.questions
    .filter((question) => question.type === type)
    .sort((left, right) => {
      const keyOrder = sha256(`${splitSeed}:${left.id}`).localeCompare(
        sha256(`${splitSeed}:${right.id}`),
      );
      return keyOrder || left.id.localeCompare(right.id);
    });

  if (candidates.length < quota) fail(`${type} has ${candidates.length} cases but needs ${quota}`);
  for (const question of candidates.slice(0, quota)) heldOutIds.add(question.id);
}

if (heldOutIds.size !== 8) fail(`expected 8 held-out cases, got ${heldOutIds.size}`);

const questions = draft.questions.map((question) => {
  const { referenceAnswerDraft, ...rest } = question;
  return {
    ...rest,
    referenceAnswer: referenceAnswerDraft,
    split: heldOutIds.has(question.id) ? "held-out" : "development",
  };
});

const frozen = {
  schemaVersion: 2,
  dataset: draft.dataset,
  status: "frozen",
  createdAt: draft.createdAt,
  frozenAt: "2026-11-19",
  distribution: draft.distribution,
  split: {
    method: "stratified deterministic SHA-256 ordering",
    methodVersion: 1,
    seed: splitSeed,
    heldOutQuotas,
    developmentCount: 22,
    heldOutCount: 8,
    assignmentRule:
      "Within each question type, sort by SHA-256(seed + ':' + question ID), breaking ties by question ID, then assign the first quota cases to held-out.",
    tuningPolicy:
      "Use development cases for retrieval decisions. Do not inspect held-out retrieval results while tuning embeddings, chunking, fusion, or reranking.",
  },
  checksum: {
    algorithm: "SHA-256",
    scope: "Exact UTF-8 bytes of questions.json",
    file: "questions.sha256",
  },
  instructions:
    "This dataset is frozen. Any label change requires a new dataset version and checksum; never silently edit this file.",
  questions,
};

const serialized = `${JSON.stringify(frozen, null, 2)}\n`;
const digest = sha256(serialized);

writeFileSync(frozenPath, serialized);
writeFileSync(checksumPath, `${digest}  questions.json\n`);

console.log(`Frozen ${questions.length} questions: 22 development, 8 held-out.`);
console.log(`SHA-256 ${digest}`);
