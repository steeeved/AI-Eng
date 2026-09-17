# FormFill

Extracts structured fields from unstructured text — give it a field schema
(id, label, type) and a blob of source text, and it returns each field's
value with a confidence score. Built mock-first: the API contract, the error
paths and the UI shipped before any model was wired in, and a deterministic
regex/label-scanning "mock" provider (`src/lib/server/fill-form/mock.ts`)
exercised all three. The real provider — Anthropic/Claude via forced tool-use,
RFC 9457 error envelopes and LangSmith tracing — is now wired in behind the
same interface; see [Swapping in / calling the real provider](#swapping-in--calling-the-real-provider).

## How it works

`src/routes/+page.svelte` is a single-page UI:

- **Source** (left card) — the unstructured text to extract from. Buttons
  above it load one of the five fixture cases from
  `src/lib/fixtures/cases.json` (invoices, a job application, a shipping
  confirmation, a support ticket), or append the `__fail` sentinel to force
  the 502 path (**break it**).
- **Fields** (right card) — the schema you want back: an `id` (snake_case),
  a `label` the extractor searches for, and a `type` (`text`, `email`,
  `number`, `date`, `select`). Add or remove rows freely.
- **Fill form** posts both to `POST /api/fill-form` and renders a **Result**
  card: each field's extracted value (or "not found") next to a confidence
  bar. A header badge shows which `provider` answered and whether the
  response was `MOCK` or `LIVE` (`meta.mock`).

The mock provider scans the source line-by-line for each field's label, then
coerces whatever follows it to the field's type (email/date regexes, digit
grouping for numbers, word-boundary matching against `options` for
`select`); it falls back to a bare email/date regex anywhere in the document
if the label match fails. It's deliberately simple — the point is to prove
out the contract, not to extract well. The Anthropic provider takes the same
request and instead asks Claude directly (see
[Structured output from Claude](#structured-output-from-claude)).

## Run it

```bash
bun install          # @anthropic-ai/sdk + langsmith were added — this step is required
bun run dev
```

## Deploy

Deployed from the `AI-Eng` monorepo. In the Vercel project settings:

| Setting | Value |
| --- | --- |
| Root Directory | `1.07/formfill` |
| Framework Preset | SvelteKit |
| Install Command | `bun install` |
| Node.js Version | 22.x |

Environment variables (set for **Production, Preview and Development** — see `.env.example`):

| Name | Value |
| --- | --- |
| `FILL_FORM_PROVIDER` | `mock` or `anthropic` — the default when a request omits `provider` |
| `ANTHROPIC_API_KEY` | required once `anthropic` is used, by default or per-request |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-haiku-4-5-20251001` |
| `LANGSMITH_TRACING` | `true` to trace every request |
| `LANGSMITH_API_KEY` | from smith.langchain.com → Settings → API Keys |
| `LANGSMITH_PROJECT` | e.g. `formfill` — groups traces in the dashboard |

Post-deploy:

```bash
bun run smoke https://<deployment>.vercel.app
EXPECT_REAL=1 bun run smoke https://<deployment>.vercel.app   # fails if prod is still mocked
```

## The contract

`src/lib/contracts/fill-form.ts` is the single source of truth. The route
handler, every provider, the fixtures and the client all import from it.

```text
POST /api/fill-form   { fields: FieldSpec[], source: string, provider?: "mock" | "anthropic" }
                   -> { fields: FilledField[], meta: { mock, model, provider, latencyMs } }
GET  /api/fill-form -> { ok: true, provider }
```

`provider` is optional and per-request — this is what proves the 1.04
abstraction: a client swaps the backing model with a body field, with zero
deploys. Omit it to use the deployment's `FILL_FORM_PROVIDER` default.

## Errors — RFC 9457 problem details

Every non-2xx response is `application/problem+json`
([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)): `type` identifies the
failure class, `status` always matches the HTTP status code, and extension
members (`errors`, `provider`, `timeoutMs`) carry the specifics. No stack
traces or raw upstream error bodies ever leave the boundary.

| Status | `type` | Meaning |
| --- | --- | --- |
| 400 | `.../bad-request` | body was not valid JSON |
| 422 | `.../validation-error` | body did not match the contract (Zod issues in `errors`) |
| 501 | `.../not-implemented` | requested provider is a seam with no implementation yet |
| 502 | `.../provider-error` | provider call failed, or returned a response that violates the contract |
| 504 | `.../timeout` | provider did not respond within the request deadline (`timeoutMs`) |

Example validation failure:

```json
{
  "type": "https://formfill.dev/problems/validation-error",
  "title": "Request did not match the contract",
  "status": 422,
  "detail": "1 field(s) failed validation.",
  "instance": "/api/fill-form",
  "errors": [{ "path": "source", "message": "String must contain at least 1 character(s)" }]
}
```

Three rules keep the swap cheap:

1. The route validates **its own response**, not just the request. Contract
   drift fails loudly at the boundary instead of rendering blanks.
2. `meta.mock` and `meta.provider` travel in the payload. The UI badges them,
   and `EXPECT_REAL=1 bun run smoke <url>` fails the build if production is
   still on the mock.
3. `src/lib/fixtures/cases.json` is both the UI's example data and the eval
   set — 5 real-world cases (invoices, a job application, a shipping
   confirmation, a support ticket). Current mock baseline: **7/7** on
   `invoice-basic`, **1/3** on `invoice-unlabelled`. Those numbers are the gap
   the real provider has to close.

## Structured output from Claude

Claude has no OpenAI-style `response_format: json_schema`. The seam here
instead forces tool-use: `src/lib/server/fill-form/anthropic.ts` gives the
model exactly one tool (`record_extraction`) shaped like the `FilledField[]`
answer and sets `tool_choice` so it must call it — the tool is never really
"called", its input *is* the answer. This is guided, not grammar-enforced the
way OpenAI's strict mode is, so the route still validates the tool's input
against the Zod schema and treats a mismatch as a `provider-error` rather
than trusting it blindly.

## Tracing

Every request that reaches a provider runs inside one LangSmith
[`traceable`](https://docs.langchain.com/langsmith/observability) span named
`fill-form`, carrying the provider name and latency. There's no first-party
`wrapAnthropic` the way LangSmith ships `wrapOpenAI`, so the Anthropic call
itself is wrapped in its own `traceable` span (`anthropic.messages.create`)
that reports token counts and an estimated cost (against a small local
pricing table — verify it against current Anthropic pricing before trusting
it for a real invoice) as a nested run. Set `LANGSMITH_TRACING=true` and
`LANGSMITH_API_KEY` to see traces in the dashboard; unset either and tracing
is inert.

## Swapping in / calling the real provider

`src/lib/server/fill-form/anthropic.ts` is implemented against the
`FillFormProvider` interface. Two ways to use it:

- **Per deployment:** set `FILL_FORM_PROVIDER=anthropic`.
- **Per request:** `{ "provider": "anthropic", ... }` in the POST body, no
  matter what the deployment default is.

Local error paths, no outage required:

- append `__fail` to the source (or click **break it**) → 502
- POST with `{ "fields": [], "source": "" }` → 422
- send `provider` set to anything outside `"mock" | "anthropic"` → 422
  (rejected before it reaches a provider)
- unset `ANTHROPIC_API_KEY` and use `provider: "anthropic"` → 502
