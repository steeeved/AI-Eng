import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VoyageAIClient } from "voyageai";
import { z } from "zod";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptStartedAt = performance.now();
const cacheDir = join(projectDir, ".cache");
const resultsDir = join(projectDir, "results");
const cachePath = join(cacheDir, "embeddings.json");
const questionsPath = join(projectDir, "questions.json");
const passagesPath = join(projectDir, "passages.generated.json");

const model = "voyage-4";
const outputDimension = 1024;
const pricePerMillionTokensUsd = 0.06;
const allowApiCalls = process.argv.includes("--allow-api-calls");
const allowHeldOut = process.argv.includes("--allow-held-out-evaluation");
const reducedRateLimits = process.argv.includes("--reduced-rate-limits");
const splitArgument = process.argv.find((argument) => argument.startsWith("--split="));
const selectedSplit = splitArgument?.split("=")[1] ?? "development";

if (selectedSplit !== "development" && selectedSplit !== "held-out") {
  throw new Error(`Unknown split: ${selectedSplit}`);
}
if (selectedSplit === "held-out" && !allowHeldOut) {
  throw new Error(
    "Held-out evaluation is locked. Use --allow-held-out-evaluation only for a recorded final evaluation, never while tuning.",
  );
}

const EvidenceSchema = z
  .object({
    documentId: z.string(),
    renderedPage: z.number().int().positive(),
    section: z.string(),
    quote: z.string(),
  })
  .passthrough();

const QuestionSchema = z
  .object({
    id: z.string(),
    type: z.enum(["exact-term", "paraphrase", "multi-passage", "unanswerable"]),
    question: z.string(),
    answerable: z.boolean(),
    evidence: z.array(EvidenceSchema),
    split: z.enum(["development", "held-out"]),
  })
  .passthrough();

const DatasetSchema = z.object({
  status: z.literal("frozen"),
  questions: z.array(QuestionSchema).length(30),
});

const PassageSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["gold", "distractor"]),
    documentId: z.string(),
    text: z.string(),
    goldFor: z.array(z.string()).optional(),
  })
  .passthrough();

const PassageSetSchema = z.object({
  datasetChecksum: z.string().length(64),
  counts: z.object({
    gold: z.number().int().nonnegative(),
    distractors: z.number().int().min(50),
    total: z.number().int().positive(),
  }),
  passages: z.array(PassageSchema),
});

const EmbedResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()).length(outputDimension),
      index: z.number().int().nonnegative(),
    }),
  ),
  usage: z.object({ totalTokens: z.number().int().nonnegative().optional() }).optional(),
});

const CacheSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.record(
    z.string(),
    z.object({
      vector: z.array(z.number()).length(outputDimension),
      model: z.string(),
      inputType: z.enum(["query", "document"]).nullable(),
      textSha256: z.string().length(64),
    }),
  ),
});

type InputType = "query" | "document" | null;
type Question = z.infer<typeof QuestionSchema>;
type Passage = z.infer<typeof PassageSchema>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dot(left: number[], right: number[]): number {
  if (left.length !== right.length) throw new Error("Embedding dimensions do not match");
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

function readCache() {
  try {
    return CacheSchema.parse(JSON.parse(readFileSync(cachePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1 as const, entries: {} };
    }
    throw error;
  }
}

const datasetBytes = readFileSync(questionsPath);
const passageBytes = readFileSync(passagesPath);
const dataset = DatasetSchema.parse(JSON.parse(datasetBytes.toString("utf8")));
const passageSet = PassageSetSchema.parse(JSON.parse(passageBytes.toString("utf8")));
const expectedDatasetChecksum = readFileSync(join(projectDir, "questions.sha256"), "utf8").split(
  /\s+/,
)[0];
if (sha256(datasetBytes.toString("utf8")) !== expectedDatasetChecksum) {
  throw new Error("questions.json does not match questions.sha256");
}
if (passageSet.datasetChecksum !== expectedDatasetChecksum) {
  throw new Error("Passage set was generated from a different dataset checksum");
}
if (passageSet.passages.length !== passageSet.counts.total) {
  throw new Error("Passage count metadata does not match passage array");
}

const questions = dataset.questions.filter((question) => question.split === selectedSplit);
const passages = passageSet.passages;
const cache = readCache();
const apiKey = process.env.VOYAGE_API_KEY;
const client = apiKey ? new VoyageAIClient({ apiKey, maxRetries: 0 }) : null;
let lastApiCallStartedAt = 0;
const callStats: Array<{
  label: string;
  inputType: InputType;
  requested: number;
  cached: number;
  apiInputs: number;
  tokens: number;
  latencyMs: number;
}> = [];

function batchIndexes(indexes: number[], texts: string[]): number[][] {
  if (!reducedRateLimits) return [indexes];
  const batches: number[][] = [];
  let batch: number[] = [];
  let characters = 0;
  for (const index of indexes) {
    const nextCharacters = texts[index].length;
    if (batch.length > 0 && (batch.length >= 20 || characters + nextCharacters > 10_000)) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(index);
    characters += nextCharacters;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function throttleVoyage(): Promise<void> {
  if (!reducedRateLimits || lastApiCallStartedAt === 0) return;
  const minimumIntervalMs = 31_000;
  const waitMs = minimumIntervalMs - (Date.now() - lastApiCallStartedAt);
  if (waitMs > 0) {
    console.log(`Waiting ${Math.ceil(waitMs / 1000)}s for Voyage's reduced rate limit...`);
    await Bun.sleep(waitMs);
  }
}

async function embedTexts(label: string, texts: string[], inputType: InputType): Promise<number[][]> {
  const keys = texts.map((text) =>
    sha256(
      JSON.stringify({ model, outputDimension, outputDtype: "float", inputType, textSha256: sha256(text) }),
    ),
  );
  const missingIndexes = keys.flatMap((key, index) => (cache.entries[key] ? [] : [index]));
  const cachedCount = texts.length - missingIndexes.length;

  if (missingIndexes.length > 0) {
    if (!allowApiCalls) {
      throw new Error(
        `${label}: ${missingIndexes.length} embedding cache misses. Re-run with --allow-api-calls only after approving the Voyage call.`,
      );
    }
    if (!client) throw new Error("VOYAGE_API_KEY is required when API calls are enabled");

    const batches = batchIndexes(missingIndexes, texts);
    for (const [batchIndex, indexBatch] of batches.entries()) {
      await throttleVoyage();
      const missingTexts = indexBatch.map((index) => texts[index]);
      lastApiCallStartedAt = Date.now();
      const startedAt = performance.now();
      const response = EmbedResponseSchema.parse(
        await client.embed({
          input: missingTexts,
          model,
          ...(inputType ? { inputType } : {}),
          truncation: false,
          outputDimension,
          outputDtype: "float",
        }),
      );
      const latencyMs = performance.now() - startedAt;
      if (response.data.length !== missingTexts.length) {
        throw new Error(
          `${label}: Voyage returned ${response.data.length} vectors for ${missingTexts.length} inputs`,
        );
      }

      for (const item of response.data) {
        const originalIndex = indexBatch[item.index];
        const text = texts[originalIndex];
        const key = keys[originalIndex];
        cache.entries[key] = {
          vector: item.embedding,
          model,
          inputType,
          textSha256: sha256(text),
        };
      }
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, `${JSON.stringify(cache)}\n`);
      callStats.push({
        label: `${label} batch ${batchIndex + 1}/${batches.length}`,
        inputType,
        requested: missingTexts.length,
        cached: 0,
        apiInputs: missingTexts.length,
        tokens: response.usage?.totalTokens ?? 0,
        latencyMs,
      });
    }
    if (cachedCount > 0) {
      callStats.push({
        label: `${label} cache hits`,
        inputType,
        requested: cachedCount,
        cached: cachedCount,
        apiInputs: 0,
        tokens: 0,
        latencyMs: 0,
      });
    }
  } else {
    callStats.push({
      label,
      inputType,
      requested: texts.length,
      cached: cachedCount,
      apiInputs: 0,
      tokens: 0,
      latencyMs: 0,
    });
  }

  return keys.map((key) => cache.entries[key].vector);
}

type CaseResult = {
  id: string;
  type: Question["type"];
  answerable: boolean;
  goldRanks: number[];
  recallAt5: number | null;
  reciprocalRank: number | null;
  top5PassageIds: string[];
};

function scoreMode(
  mode: "typed-inputs" | "control-no-input-types",
  queryVectors: number[][],
  passageVectors: number[][],
) {
  const cases: CaseResult[] = questions.map((question, questionIndex) => {
    const ranked = passages
      .map((passage, passageIndex) => ({
        passage,
        score: dot(queryVectors[questionIndex], passageVectors[passageIndex]),
      }))
      .sort((left, right) => right.score - left.score || left.passage.id.localeCompare(right.passage.id));

    const goldIds = new Set(
      passages
        .filter((passage) => passage.goldFor?.includes(question.id))
        .map((passage) => passage.id),
    );
    const goldRanks = ranked.flatMap(({ passage }, index) =>
      goldIds.has(passage.id) ? [index + 1] : [],
    );

    if (question.answerable && goldRanks.length !== question.evidence.length) {
      throw new Error(
        `${question.id}: expected ${question.evidence.length} gold passages, found ${goldRanks.length}`,
      );
    }

    return {
      id: question.id,
      type: question.type,
      answerable: question.answerable,
      goldRanks,
      recallAt5:
        goldRanks.length === 0
          ? null
          : goldRanks.filter((rank) => rank <= 5).length / goldRanks.length,
      reciprocalRank: goldRanks.length === 0 ? null : 1 / Math.min(...goldRanks),
      top5PassageIds: ranked.slice(0, 5).map(({ passage }) => passage.id),
    };
  });

  const scoredCases = cases.filter(
    (result): result is CaseResult & { recallAt5: number; reciprocalRank: number } =>
      result.recallAt5 !== null && result.reciprocalRank !== null,
  );
  const types: Question["type"][] = [
    "exact-term",
    "paraphrase",
    "multi-passage",
    "unanswerable",
  ];

  return {
    mode,
    metricDefinition: {
      recallAt5:
        "For each answerable question: gold passages ranked in the top 5 divided by all required gold passages; aggregate is the mean across questions.",
      mrr: "For each answerable question: reciprocal rank of the highest-ranked gold passage; aggregate is the mean across questions.",
      unanswerable:
        "Excluded from deterministic retrieval Recall@5 and MRR because no gold passage exists; answer abstention is evaluated separately.",
    },
    overall: {
      scoredQuestions: scoredCases.length,
      recallAt5: mean(scoredCases.map(({ recallAt5 }) => recallAt5)),
      mrr: mean(scoredCases.map(({ reciprocalRank }) => reciprocalRank)),
    },
    byType: Object.fromEntries(
      types.map((type) => {
        const typed = scoredCases.filter((result) => result.type === type);
        return [
          type,
          {
            totalQuestions: cases.filter((result) => result.type === type).length,
            scoredQuestions: typed.length,
            recallAt5: mean(typed.map(({ recallAt5 }) => recallAt5)),
            mrr: mean(typed.map(({ reciprocalRank }) => reciprocalRank)),
          },
        ];
      }),
    ),
    cases,
  };
}

const passageTexts = passages.map(({ text }) => text);
const queryTexts = questions.map(({ question }) => question);

const typedPassageVectors = await embedTexts("typed documents", passageTexts, "document");
const typedQueryVectors = await embedTexts("typed queries", queryTexts, "query");
const controlPassageVectors = await embedTexts("control documents", passageTexts, null);
const controlQueryVectors = await embedTexts("control queries", queryTexts, null);

const runs = [
  scoreMode("typed-inputs", typedQueryVectors, typedPassageVectors),
  scoreMode("control-no-input-types", controlQueryVectors, controlPassageVectors),
];
const totalTokens = callStats.reduce((sum, call) => sum + call.tokens, 0);
mkdirSync(resultsDir, { recursive: true });
const resultPath = join(resultsDir, `${selectedSplit}-${model}.json`);
let priorResult: any = null;
try {
  priorResult = JSON.parse(readFileSync(resultPath, "utf8"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const embeddingCreation =
  totalTokens > 0
    ? {
        apiCalls: callStats.filter(({ apiInputs }) => apiInputs > 0).length,
        totalTokens,
        totalApiLatencyMs: callStats.reduce((sum, call) => sum + call.latencyMs, 0),
        wallClockMs: performance.now() - scriptStartedAt,
        listedPricePerMillionTokensUsd: pricePerMillionTokensUsd,
        estimatedCostBeforeFreeTierUsd: (totalTokens / 1_000_000) * pricePerMillionTokensUsd,
      }
    : priorResult?.api?.embeddingCreation ?? null;
const result = {
  schemaVersion: 1,
  datasetChecksum: expectedDatasetChecksum,
  passageSetChecksum: sha256(passageBytes.toString("utf8")),
  split: selectedSplit,
  heldOutUnlocked: selectedSplit === "held-out",
  model: {
    provider: "Voyage AI",
    name: model,
    outputDimension,
    outputDtype: "float",
    similarity: "dot product (equivalent to cosine for normalized Voyage vectors)",
  },
  corpus: passageSet.counts,
  api: {
    embeddingCreation,
    currentExecution: {
      calls: callStats,
      totalTokens,
      wallClockMs: performance.now() - scriptStartedAt,
      estimatedCostBeforeFreeTierUsd: (totalTokens / 1_000_000) * pricePerMillionTokensUsd,
    },
  },
  runs,
};

if (totalTokens === 0 && priorResult) {
  if (
    priorResult.datasetChecksum !== result.datasetChecksum ||
    priorResult.passageSetChecksum !== result.passageSetChecksum ||
    JSON.stringify(priorResult.runs) !== JSON.stringify(result.runs)
  ) {
    throw new Error("Cached rerun does not match the recorded baseline result");
  }
  console.log(`Verified cached metrics; preserved ${resultPath}`);
} else {
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${resultPath}`);
}

for (const run of runs) {
  console.log(
    `${run.mode}: Recall@5=${run.overall.recallAt5?.toFixed(3)} MRR=${run.overall.mrr?.toFixed(3)} (${run.overall.scoredQuestions} answerable questions)`,
  );
}
console.log(`Tokens billed by this execution: ${totalTokens}`);
