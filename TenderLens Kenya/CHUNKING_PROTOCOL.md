# TenderLens Kenya — Chunking Experiment Protocol (PER-92)

Written before any chunking run. After the first run, change this file only by appending to the change log with a reason.

## Question

At the same model and `k`, does the structure-aware strategy retrieve the gold evidence better than a plain fixed-size baseline?

## Held constant

- Dataset: development split only (22 questions), frozen checksum in `questions.sha256` (`acca9154…`), unchanged. Held-out stays locked behind its flag.
- Scored questions: answerable development questions. Unanswerable questions are excluded from retrieval metrics.
- Model: `voyage-4`, 1,024-dimensional float, query/document input types, dot product.
- Corpus: full text of the five registered documents. The 90-passage pool is not used.
- Depth: `k = 5`.

## Arms

- **Baseline:** recursive fixed-size splitter, 512 tokens, no overlap. Plain text embedded.
- **Structure-aware:** split on heading and clause boundaries, capped at 512 tokens, no overlap. Heading path included in `embedText`.

These are two complete strategies. A win cannot be attributed to boundaries alone or to headings alone. A heading-prefix ablation is a later experiment. Results apply to a 512-token cap only; no claim about other sizes.

## Chunk contract

`id`, `docId`, `page`, `charStart`, `charEnd`, `headingPath`, `tokenCount`, `text` (shown and cited), `embedText` (embedded).

## Primary hit definition

A retrieved chunk is a hit for a gold span when both are in the same document and their character ranges overlap.

- Recall@5 for a question: fraction of its gold spans hit by at least one top-5 chunk.
- MRR: reciprocal rank of the first hit.

Diagnostic only, not a decision metric: gold-span coverage (or IoU) of each hit chunk. Any overlap is a lenient hit, so coverage shows whether hits actually contain the evidence.

## Reported metrics

Per question type and overall: Recall@5, MRR, total tokens in the top 5 (mean and median), chunk count, total embedded tokens, embedding cost.

## Before the first run

1. Count chunks and tokens for both arms. Estimate Voyage cost and wall-clock at the account's current rate limit.
2. Paid calls need explicit approval and the `--allow-api-calls` flag. Cache-only reruns stay free.

## Decision rule (set now)

If both arms reach the same Recall@5 and MRR, report a tie. Do not declare a winner. Retrieved tokens and chunk count are secondary context, not a tie-breaker for retrieval quality. A tie means the development set cannot separate the strategies, which is evidence for the dataset expansion below, not for either chunker.

## Miss classification (stretch)

Classify every miss as extraction, splitting, ranking or context assembly. Record locally.

## Out of scope for PER-92

Dataset expansion (wrong-document and hard-negative questions, real-user phrasing) is a separately versioned change with its own checksum, done before hybrid search or reranking decisions. Do not alter the frozen dataset during this experiment. Held-out remains untouched.

## Publication

Public: this protocol, code and checksums. Local: question files, passage text, per-case results and aggregate metrics, per `DATASET.md`. On stream: question IDs and checksums only, never passage text or `.env`.

## Change log

- 2026-11-20, before any run: reduced to one 512-token no-overlap baseline versus one structure-aware strategy; hit = same-document span overlap with coverage as a diagnostic; dataset left frozen; added tie rule. Reason: PER-92 scope.
- 2026-11-20, before any run: the 512 cap is measured in proxy tokens (`/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu`), not Voyage tokens. The real Voyage-to-proxy ratio is recorded on the first paid run. Reason: no tokenizer calls before the first approved run.
- 2026-11-20, before any run: structure-aware boundaries are Word heading styles, then whole paragraphs, because clause numbers are Word auto-numbering and are not in the document text. Reason: clause-number boundaries cannot be detected from text.
- 2026-11-20, before any run: extraction now rebuilds Word list labels (`(i)`, `2.1`, `a)`) from `numbering.xml` and style numbering, and prefixes them to the paragraph text for both arms. Reason: gold quotes copied from the rendered document include these labels, and tlk-q015 could not be located without them. The label text is unchanged. Both arms see the same corpus text; corpus size grew from 234,932 to 244,860 proxy tokens.
- 2026-11-20, before any run: a gold span can occur more than once in a document. A retrieved chunk is a hit if it overlaps ANY occurrence; all occurrences are stored per span in `.cache/chunks/gold-spans.json`. Applies to tlk-q016 (both spans, two occurrences each). Reason: the question has no single correct location.
- 2026-11-20, before any run: structure-aware arm merges chunks under 50 proxy tokens into the following chunk, never above the 512 cap. The last chunk of a document is exempt. 15 chunks stay under 50 because merging would exceed the cap. Baseline splitter unchanged. Reason: heading-only chunks embed poorly and inflate the chunk count (1,126 to 969).
