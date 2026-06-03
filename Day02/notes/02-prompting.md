# Day 02 · Context Engineering — Notes

## Task under test

> "The battery lasts forever and the camera is stunning, but the phone runs hot during video calls and the price feels steep for what you get."

Classify as Positive / Negative / Neutral + one-sentence reason.

---

## Variant results

| Variant | Classification | Notes |
|---|---|---|
| 1 · Zero-shot | Neutral | The review contains both significant praise (battery life, camera quality) and notable complaints (overheating, high price), with no clear dominance of either sentiment. |
| 2 · Few-shot | Neutral | The customer praises key features but balances them with significant concerns about performance and value, resulting in a mixed assessment. |
| 3 · Chain-of-Thought | Neutral | The review presents both considerable strengths and meaningful weaknesses with roughly equal emphasis, indicating the customer has mixed feelings about the product rather than a clearly positive or negative overall impression. |
| 4 · Role-conditioned | Mixed | The review praises battery life and camera quality but raises concerns about overheating and value for money, presenting both positive and negative aspects. |
| 5 · Decomposed | Neutral | The product has significant strengths (battery life and camera) that are offset by meaningful drawbacks (overheating issues and poor value proposition), making the overall sentiment balanced rather than clearly positive or negative. |
| 6 · JSON-mode | Neutral | The review contains balanced praise for battery and camera quality alongside notable complaints about overheating and pricing, resulting in a mixed assessment. |

---

## Winner

**Variant:** <!-- e.g. "Role-conditioned" -->

**Why I think it won:**
<!-- Your hypothesis here. Think about: was the system prompt doing the formatting work so the user turn stayed focused? Did structured output help? -->

---

## Lost-in-the-Middle findings

| Position | Answer correct? | Verbatim answer |
|---|---|---|
| Early (passage 3) | | |
| Middle (passage 15) | | |
| Late (passage 28) | | |

**Observation:**
<!-- Did the model miss the middle passage? Was it confidently wrong, or did it hedge? -->

**Hypothesis — why this happens:**
<!-- Attention in transformers favors the first and last tokens in a sequence (primacy + recency). The middle of a long context gets less "weight" from the attention mechanism. This has held across GPT-3, GPT-4, Claude 2, Claude 3 — unlikely to fully disappear even as context windows grow. -->

---

## Takeaways for the 60-day build

- [ ] Always put critical instructions at the **top** of the system prompt and repeat key constraints at the **bottom**.
- [ ] For extraction tasks over long docs, prefer **decomposed** (chunk → extract → aggregate) over one-shot over the full context.
- [ ] JSON-mode is worth the small prompt overhead whenever the output feeds another system.
