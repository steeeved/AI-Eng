# TenderLens Kenya Dataset

The labelled evaluation dataset is kept local while PPRA redistribution and excerpt-display permission remains unresolved. Do not commit `questions.draft.json`, `questions.json`, generated passages, embedding vectors or the source documents.

## End of 2026-11-18 stream

- 30 drafted questions
- 10 exact-term
- 10 paraphrase
- 5 multi-passage
- 5 unanswerable
- `tlk-q001` through `tlk-q010` human-verified
- `tlk-q011` through `tlk-q030` pending human verification
- development/held-out split not yet assigned

The local labels retain document, page, section and quoted-span evidence so later retrieval experiments can be measured without publishing those excerpts prematurely.

## End of 2026-11-19 stream

- all 30 questions human-verified with stable evidence locators
- provisional Prequalification cases replaced rather than weakening their labels
- deterministic stratified split: 22 development / 8 held-out
- frozen dataset SHA-256: `acca9154eeadc3506b0a919b2c161f727809bf9235b850240406092b7abfe6a3`
- held-out retrieval remains locked from tuning

The frozen JSON stays local. Its checksum, split method and validation script are public. Per-case ranks and aggregate retrieval results also stay local, consistent with `EMBEDDINGS.md`, until PPRA redistribution and excerpt-display permission is confirmed; after that, aggregate metrics may be published.
