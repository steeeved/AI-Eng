# TenderLens Kenya Project Brief

## Decision

TenderLens Kenya will be an evidence-first search system for five current PPRA standard tender documents. It will teach retrieval engineering through a measured sequence: vector retrieval, chunking, hybrid search, reranking and cited answers.

The first release uses a fixed local corpus. It will not begin as a general document-upload product or an autonomous tender-writing agent.

## User

The primary user is a Kenyan SME bid officer or procurement consultant who needs to locate authoritative requirements across long, similar PPRA standard tender documents.

## Problem

The user currently searches large Word or PDF files manually. Exact clause numbers can be found with ordinary text search, but paraphrased questions, similar clauses across procurement categories and document-version differences make the work slow and error-prone.

A wrong answer can cause the user to rely on the wrong procurement category, miss a mandatory requirement or cite a superseded provision. TenderLens must therefore prefer an explicit refusal over an unsupported answer.

## Product promise

For an answerable question, TenderLens will return:

- the most relevant evidence passage;
- a concise answer grounded only in retrieved evidence;
- the document title, version, page and section; and
- a citation that resolves to the exact retrieved passage.

For an unanswerable question, TenderLens will state that the selected corpus does not provide enough evidence.

## When AI is justified

Exact identifiers such as clause numbers should use deterministic or full-text search. Semantic retrieval is justified for paraphrases and concept-level questions whose wording differs from the source. Hybrid search will be retained only if evaluation shows that combining both methods improves the labelled question set.

## Corpus

The initial corpus contains five different procurement document types, each with its own recorded version. It does not contain five historical revisions of one document.

1. Works - Building and Associated Civil Engineering Works
2. Procurement of Goods
3. Request for Proposals for Selection of Consulting Firms
4. Prequalification for Works and Goods Contracts
5. Request for Quotations

The five documents were selected because they contain overlapping terminology but materially different procedures. This creates realistic exact-term, paraphrase, wrong-document and multi-passage retrieval cases.

The authoritative registry is `documents.json`. The remaining downloaded PPRA documents are out of scope for the first evaluation.

## Evaluation

The dataset will contain 30 manually labelled questions:

- 22 development questions;
- 8 held-out questions that will not influence chunking, fusion or reranking decisions;
- exact-term, paraphrase, multi-passage, unanswerable and wrong-document or wrong-version cases; and
- evidence labels that reference the source document, page, section and quoted span rather than a generated chunk ID.

Retrieval will be measured separately from answer generation using Recall at 5 and mean reciprocal rank. Unsupported claims and invalid citation identifiers have zero tolerance.

## Acceptance criteria

- At least 7 of 8 held-out evidence passages appear in the top five results.
- No unsupported claim is produced on the held-out set.
- Every displayed citation resolves to an evidence passage retrieved for that request.
- Vector, hybrid and reranked retrieval are compared per question.
- Cost and latency are reported for every retained stage.
- The portfolio demo includes an exact-term query, a paraphrase and an unanswerable question.

## Out of scope for the first release

- generating or completing a tender submission;
- legal or procurement advice;
- determining bidder eligibility or recommending an award;
- live tender-opportunity aggregation;
- customer uploads, authentication or multi-tenant storage;
- background ingestion, semantic answer caching and query rewriting; and
- OCR for scanned documents.

## Data and publication constraints

The downloaded files are public PPRA downloads, but their covers contain copyright and redistribution restrictions. They must remain outside the public repository and public deployment until redistribution and excerpt-display permission is confirmed. A public demo may need permission from PPRA or a replacement corpus with explicit reuse terms.

No document should be treated as current merely because it was downloaded from the current page. Currency must be checked against PPRA before the portfolio release.

## Learning outcomes

Completing this project should demonstrate that I can:

- build and audit a retrieval evaluation set before choosing an architecture;
- distinguish extraction, chunking, candidate-recall, ranking and generation failures;
- choose between exact, semantic and hybrid search from per-case evidence;
- decide whether reranking earns its latency and cost;
- enforce structured, verifiable citations at the model boundary; and
- explain the final architecture and its rejected alternatives to a client.

## Open verification items

- Confirm that each selected file is still the current PPRA version.
- Confirm direct download-page URLs for Goods, Request for Proposals and Request for Quotations.
- Confirm redistribution and excerpt-display permission before publishing the corpus or cited passages.
- Reconcile the one-page difference between Word metadata and LibreOffice rendering for the Works document.
