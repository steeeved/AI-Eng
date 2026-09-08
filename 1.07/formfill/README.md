# FormFill

Extracts structured fields from unstructured text. Built mock-first: the API
contract, the error paths and the UI all ship before any model is wired in.

## Run it

```bash
bun install          # zod was added — this step is required
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

Environment variables (set for **Production, Preview and Development**):

| Name | Value |
| --- | --- |
| `FILL_FORM_PROVIDER` | `mock` |
| `OPENAI_API_KEY` | leave empty until the real provider lands |

Post-deploy:

```bash
bun run smoke https://<deployment>.vercel.app
```

## The contract

`src/lib/contracts/fill-form.ts` is the single source of truth. The route
handler, every provider, the fixtures and the client all import from it.

```
POST /api/fill-form   { fields: FieldSpec[], source: string }
                   -> { fields: FilledField[], meta: { mock, model, latencyMs } }
GET  /api/fill-form -> { ok: true, provider }
```

| Status | Meaning |
| --- | --- |
| 200 | filled |
| 400 | body was not JSON |
| 422 | body did not match the contract |
| 501 | provider is a seam with no implementation yet |
| 502 | provider failed, or returned a response that violates the contract |

Three rules keep the swap cheap:

1. The route validates **its own response**, not just the request. Contract
   drift fails loudly at the boundary instead of rendering blanks.
2. `meta.mock` travels in the payload. The UI badges it, and `EXPECT_REAL=1
   bun run smoke <url>` fails the build if production is still on the mock.
3. `src/lib/fixtures/cases.json` is both the UI's example data and the eval
   set. Current mock baseline: **7/7** on `invoice-basic`, **1/3** on
   `invoice-unlabelled`. That second number is the gap a real model has to close.

## Swapping in the real provider

Implement `src/lib/server/fill-form/openai.ts` against the existing
`FillFormProvider` interface, return `mock: false` and the real model id, then
set `FILL_FORM_PROVIDER=openai`. Nothing else changes — not the route, not the
contract, not the UI.

Local error paths, no outage required:

- append `__fail` to the source (or click **break it**) → 502
- `FILL_FORM_PROVIDER=openai bun run dev` → 501
