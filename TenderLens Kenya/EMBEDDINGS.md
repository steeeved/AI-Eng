# TenderLens Kenya — In-Memory Embedding Baseline

## Public summary

The development-only baseline is implemented with `voyage-4`, 1,024-dimensional float vectors and dot-product similarity. It compares correctly typed query/document embeddings with a control that omits input types.

The local experiment uses:

- the frozen 22-question development split;
- exact gold evidence spans;
- 60 deterministic distractors drawn from the same five-document corpus;
- per-question gold ranks, Recall@5 and MRR;
- metrics separated by question type; and
- a locked held-out path that requires an explicit command-line flag.

Embeddings are cached by model, dimensions, input type and text checksum. Cache-only reruns make no provider calls and verify that recomputed metrics match the recorded local result.

## Publication boundary

The repository is public, while PPRA redistribution and excerpt-display permission remains unresolved. Therefore the following stay local:

- question and quoted-evidence JSON;
- generated passage text;
- embedding vectors;
- per-case ranks and aggregate retrieval results; and
- API credentials.

The public repository retains the experiment code, dataset checksum, split method and reproduction instructions without exposing the underlying excerpts or derived retrieval results.

## Reproduction

With the private corpus and local question files present:

```bash
bun run dataset:freeze
shasum -a 256 -c questions.sha256
bun run passages:build
bun --env-file=../.env run scripts/run-embedding-baseline.ts
```

New provider calls require `--allow-api-calls`. Held-out evaluation additionally requires `--split=held-out --allow-held-out-evaluation` and must not be used during tuning.

## Next step

Carry the fixed development baseline into PER-92's chunking comparison. Do not inspect held-out results while choosing a chunking strategy.
