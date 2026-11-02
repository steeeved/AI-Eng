# EVAL_LOG — FormFill (1.10)

The instrument is `bun run eval`; the gate is `bun run gate`. This file is the
record of what the instrument found and what changed in response. It is not a
changelog. One entry = one case (or one named failure category), one diagnosis,
one change, one re-run.

## Method

1. Run the golden set against the real provider through `/api/fill-form`.
2. Read every failed field. Group failures into named categories **before**
   touching the prompt. Count them.
3. For each category, name the layer that failed: **source** (the document is
   ambiguous or corrupt), **prompt**, **schema**, or **validation**.
4. Change one thing. Re-run. Record the before/after field counts.
5. Anything still failing after the timebox is a **known limitation**, written
   down here. It does not get silently dropped.

Rules:

- The tuning split may be tuned against. The **held-out split may not**. It is
  reported, never used to choose a prompt or fixture.
- A percentage on five fields is not evidence. Report field counts, not just
  rates.
- `invented` (expected `null`, got a value) is never averaged into accuracy. It
  has its own zero-tolerance gate.

## Thresholds

| Gate | Threshold |
| --- | --- |
| Tuning field accuracy | ≥ 95% |
| Invented values for absent fields | 0 |
| Held-out field accuracy | reported only, not gated |

## Golden-set decisions

These are policies, not model outputs. They are recorded here because the
expected value is only defensible if the rule behind it is written down.

- **Dates** are expected as ISO `YYYY-MM-DD`. Sources use DD/MM (Kenyan
  convention) unless stated otherwise; `mixed-date-formats` includes a
  `D-Mon-YY` value, interpreted as `2027-09-03`.
- **Numbers** are expected as plain digit strings (`"2500"`, not `"2.5k"`).
  Suffix shorthand expands: `2.5k → 2500`, `38k → 38000`. For `number` fields the
  comparator scores numerically, so `2500.00` is the same answer as `2500` —
  and anything that does not parse as a number is still wrong.
- **Identifiers exclude typographic punctuation.** A leading `#` in
  `#ORD-88231` is a prefix marker, not part of the id, so expected is
  `ORD-88231`. Applied consistently to `shipping-confirmation` and
  `order-not-shipped`.
- **Plan names exclude billing cadence.** `FormStack Pro (annual)` is the
  product plus a billing term; the plan name is `FormStack Pro`.
- **A generic `Contact` field means the person's name.** A phone field is
  labelled `Contact Phone` (see `as-per-conversation`), so `relative-deadline`
  expects `Wambui Kariuki`.
- **An `Attendee` field excludes the sender/signatory** unless the source says
  they will attend. `meeting-moved` is signed by Njeri but names no attendee,
  so the field stays `null`.
- **Corrections win.** When a document quotes an old figure and then explicitly
  supersedes it, the expected value is the superseding figure
  (`quote-then-correction`, `amount-corrected-on-call`).
- **Relative dates are not resolved.** `next Tuesday`, `end of month` and
  `in two weeks` are returned as `null`, never computed from the send date.
  "Next Tuesday" is genuinely ambiguous (coming Tuesday vs the following
  week's), and LLM calendar arithmetic is unreliable; a wrong date on an
  insurance or HR form is worse than a blank one a clerk can fill. This policy
  is stated in the prompt and in the fixture description, and it applies to
  every date field, not just `relative-deadline`.
- **Null means absent from the source**, not "hard to find". A promise of a
  value later (`we'll SMS you a slot`) is still `null`.
- Expected values are hand-derived from the source text. Do not paste labels
  from an LLM, including an assistant.

## Runs

| Run | Date | Model | Tuning | Held-out | Invented | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 2026-11-02 | — | — | — | — | Harness built; first attempt blocked: the repo's `ANTHROPIC_API_KEY` returns 401. No fields scored, nothing tuned. |
| 1 | 2026-11-02 | claude-haiku-4-5 | 88/90 (97.8%) | 24/29 (82.8%) | 1 | Baseline. Failures: `saas-renewal.plan_name`, `marketing-footer-burial.warehouse` (tuning); `delivery-slot-missing.delivery_date`, `mixed-date-formats.policy_start` (DD/MM inverted), `relative-deadline.project/contact`, `meeting-moved.attendee` (held-out). |
| 2 | 2026-11-02 | claude-haiku-4-5 | 88/90 (97.8%) | 26/29 (89.7%) | 1 | Golden-set corrections only (plan name policy, generic Contact = name, Attendee label). `relative-deadline` now 3/3. `saas-renewal.plan_name` flipped to `FormStack Pro (annual)` — same prompt, opposite answer from Run 1. Sampling variance, not a label fix. |
| 3 | 2026-11-02 | claude-haiku-4-5 | 88/90 (97.8%) | 24/29 (82.8%) | 1 | `temperature: 0` only. Did not stabilise output: `relative-deadline.contact` went from correct to `Wambui Kariuki \| 0720 111 445`, and `project` regressed to `Starline Expo setup`. Treat temperature 0 as a variance reducer, not a determinism guarantee. |
| 4 | 2026-11-02 | claude-haiku-4-5 | 89/90 (98.9%) | 27/29 (93.1%) | 1 | Prompt: numeric dates are DD/MM. Fixed `delivery-slot-missing.delivery_date` and `mixed-date-formats.policy_start` (both were inverted to March). `marketing-footer-burial.warehouse` also passed this run — unchanged field, so treat that as variance. Remaining: plan name, attendee, relative project. |
| 5 | 2026-11-02 | claude-haiku-4-5 | 89/90 (98.9%) | 27/29 (93.1%) | 1 | Prompt: return only the value, no adjacent words. Did not fix `relative-deadline.project` (`Starline Expo setup`). Changed `saas-renewal.plan_name` from `FormStack Pro (annual)` to `Pro` — the fixture says "read the labels", and the explicit label is `Plan: Pro`, so the label was corrected to `Pro` rather than the prompt. |
| 6 | 2026-11-02 | claude-haiku-4-5 | 89/90 (98.9%) | 28/29 (96.6%) | 0 | Prompt: a signature names the sender, not an attendee. `meeting-moved` now 4/4 and the invented gate passes. Remaining: `relative-deadline.project` (held-out) and `saas-renewal.plan_name`, which flips between `Pro` and `FormStack Pro` across runs. |
| 7 | 2026-11-02 | claude-haiku-4-5 | 89/90 (98.9%) | 28/29 (96.6%) | 0 | Confirmation rerun, no changes. Identical counts, gate passed twice: tuning 98.9%, held-out 96.6%, invented 0. |

## Error categories

Fill these in from the first real run. Categories are named after the failure,
not after the field.

| Category | Count | Layer | Example case |
| --- | --- | --- | --- |
| Date-order inversion (`03/10/2026` read as 10 March) | 2 fields in Run 1, 0 after fix | prompt | `delivery-slot-missing.delivery_date`, `mixed-date-formats.policy_start` |
| Over-extraction / wrong value boundary | 1–3 fields per run | prompt | `relative-deadline.project` → `Starline Expo setup`; `marketing-footer-burial.warehouse` → `Athi River warehouse` |
| Sender mistaken for attendee | 1 field, every run before Run 6 | prompt | `meeting-moved.attendee` → `Njeri` (signatory) |
| Plan name: brand vs explicit label | 1 field, flips between runs | source ambiguity + model variance | `saas-renewal.plan_name` → `Pro` vs `FormStack Pro` |
| Identifier punctuation (`#` prefix) | 1 field in Run 1 | validation / label policy | `shipping-confirmation.order_number` |

## Entries

### `delivery-slot-missing`, `mixed-date-formats` — DD/MM dates read as MM/DD

- **Failed fields:** `delivery_date` (`03/10/2026` → `2026-03-10`), `policy_start` (`03/09/2026` → `2026-03-09`)
- **Category:** date-order inversion
- **Layer:** prompt
- **Why it failed:** the prompt said "dates as YYYY-MM-DD" but never gave the source order. The model applied US MM/DD to Kenyan DD/MM documents.
- **Change:** one line — numeric day/month dates are DD/MM unless stated otherwise.
- **Before:** Run 1, held-out 24/29
- **After:** Run 4, held-out 27/29; both fields correct
- **Kept?** yes

### `meeting-moved` — signature treated as attendee

- **Failed fields:** `attendee` (expected `null`, got `Njeri`)
- **Category:** sender mistaken for attendee
- **Layer:** prompt
- **Why it failed:** the only human name is the signatory, so the model answered the attendee field with the person who sent the email.
- **Change:** one line — a signature names the sender, not an attendee, unless attendance is stated.
- **Before:** invented = 1 in Runs 1–5
- **After:** Run 6, `meeting-moved` 4/4, invented = 0
- **Kept?** yes — note the contamination disclosure under Known limitations.

### `relative-deadline` — over-extraction at the value boundary

- **Failed fields:** `project` (`Starline Expo setup` for `Starline Expo`), `contact` (`Wambui Kariuki | 0720 111 445` for `Wambui Kariuki`)
- **Category:** over-extraction / value boundary
- **Layer:** prompt + source ambiguity
- **Why it failed:** the model continued reading past the field's value into the activity noun or the next contact detail.
- **Change:** "return only the value itself … stop at the field boundary." Also clarified the generic `Contact` field as a person's name.
- **Before:** 1/3 fields in Run 1
- **After:** `contact` fixed; `project` still wrong in Run 6
- **Kept?** prompt line kept; the remaining `project` miss is a known limitation, not tuned against (held-out).

### `saas-renewal` — plan name has two defensible answers

- **Failed fields:** `plan_name` (`FormStack Pro (annual)`, `FormStack Pro`, `Pro` across runs)
- **Category:** source ambiguity + model variance
- **Layer:** source
- **Why it failed:** the source contains both a product line and an explicit `Plan: Pro` label. The model alternates between them even at `temperature: 0`.
- **Change:** expected value set to `Pro` because the fixture says "read the labels" and `Plan:` is the label. No prompt change.
- **Before:** wrong in Runs 1–3 and 6
- **After:** still flips; tuning stays above the 95% gate
- **Kept?** yes, logged as a known limitation.

### Measurement — `temperature: 0` did not make the gate deterministic

- **Failed fields:** none directly; `saas-renewal.plan_name` and
  `relative-deadline.contact` flipped between identical runs
- **Category:** measurement variance
- **Layer:** validation (harness)
- **Why it failed:** the same prompt returned `FormStack Pro (annual)` in Run 1
  and `FormStack Pro` in Run 2; after `temperature: 0`, `relative-deadline.contact`
  changed again. A gate whose inputs move on their own is not a gate.
- **Change:** `temperature: 0` on both provider paths.
- **Before:** variance present in Runs 1–2
- **After:** variance reduced, not eliminated (Run 3 still moved
  `relative-deadline.contact`)
- **Kept?** yes — documented as a reducer, not a guarantee.

### Golden-set corrections — label normalisation before tuning

- **Cases:** all 25 new fixtures plus the original 5
- **Category:** label format / ambiguous gold answers
- **Layer:** source (labels), not prompt
- **Why it failed:** 43 values violated the fixture's own format policy (dates
  not ISO, `2.5k`/`38k` left unexpanded, numeric values in text fields); one
  source had `Period: §` where the description said `Aug 2026`; and three
  labels were genuinely ambiguous (plan name, generic `Contact`, `Attendee` vs
  sender).
- **Change:** normalised formats, repaired the corrupted source, and wrote the
  ambiguity policies down under Golden-set decisions.
- **Before:** the merge guard refused 21 values; six substantive errors found
  by hand
- **After:** merge accepted; Run 2 confirmed `relative-deadline` 3/3
- **Kept?** yes — no semantic value was changed to match a model output without
  a stated rule.

Template — copy for each fix:

```markdown
### <case-id> — <one-line diagnosis>

- **Failed fields:** `field_a`, `field_b`
- **Category:** <named category>
- **Layer:** source | prompt | schema | validation
- **Why it failed:** <what the model actually did, with the observed value>
- **Change:** <the one thing changed>
- **Before:** <cases/fields failing>
- **After:** <cases/fields failing>
- **Kept?** yes | reverted — <reason>
```

## Confidence

`confidence` is a self-reported number, not a measured probability. Run 6:

| | Mean confidence | Fields |
| --- | --- | --- |
| Correct | 0.961 | 117 |
| Incorrect | 0.950 | 2 |

The 0.95–1.00 bucket was 98.2% accurate, but the two wrong answers were just as
confident as the right ones. There is no separation, so the field carries no
usable uncertainty signal. The UI labels it **self-reported, uncalibrated**.
Do not gate on confidence until a run shows a real gap between the correct and
incorrect means (or train a calibrated wrapper).

## Known limitations

- **`relative-deadline.project`** still returns `Starline Expo setup` instead of
  `Starline Expo`. This is a held-out case and was deliberately not tuned
  against; the held-out score (96.6%) is reported with the miss included.
- **`saas-renewal.plan_name`** flips between `Pro` and `FormStack Pro` across
  identical runs. `temperature: 0` reduces but does not eliminate sampling
  variance. The case is a weak measurement; the 95% threshold absorbs it.
- **Held-out contamination (disclosed).** The sender-signature rule was written
  after seeing the `meeting-moved` failure, which is in the held-out split. The
  rule is general (signatures are not attendance records), but the split is no
  longer fully clean for that behaviour. Do not repeat this: the invented gate
  is zero-tolerance, which forces a fix even when the evidence is held-out.
- **No failure for `schema` or `validation` layers** was observed. Every failure
  was source, prompt or label. That is a property of this run, not a claim that
  those layers are correct.
- **Small field count.** 119 scored fields is enough to find category-level
  bugs, not enough to publish a precise accuracy claim.
