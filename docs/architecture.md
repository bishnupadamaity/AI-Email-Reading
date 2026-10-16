# Architecture

## Purpose

Business emails and their attachments arrive, are analysed by an LLM-driven
workflow, validated, and either accepted automatically or routed to a human
review queue.

**Status: first AI analysis slice, AI in Python.** The monorepo, PostgreSQL
schema, email ingestion and REST surface are implemented and verified.
Extraction runs against a real provider (OpenAI) **synchronously**, inside the
request: the NestJS API calls a dedicated Python service over internal HTTP.
Attachment parsing, OCR, authentication, review workflows and the dashboard
features are _not_ implemented.

## Applications and packages

| Workspace             | Language   | Responsibility                                                       |
| ---------------------- | ---------- | --------------------------------------------------------------------- |
| `frontend`             | TypeScript | React dashboard. Talks to the API over HTTP and nothing else.         |
| `backend`              | TypeScript | REST endpoints, auth/authorization, business rules, persistence.      |
| `ai-service`           | **Python** | Every AI operation: provider integration, model routing, extraction.  |
| `packages/contracts`   | TypeScript | Shared types and Zod schemas, including the internal AI contract.     |
| `packages/config`      | TypeScript | Environment loading and validation shared by TypeScript workspaces.   |

`ai-service` is a Python package with its own `pyproject.toml`,
`requirements.lock`, tests and tooling (pytest, Ruff, mypy). It is not part of
the pnpm workspace and is independently runnable and testable — see
[ai-service/README.md](../ai-service/README.md).

## Dependency rules

```
                 ┌──────────────┐
                 │   frontend   │   browser
                 └──────┬───────┘
                     HTTP │
                 ┌──────▼───────┐
                 │   backend    │
                 │   (NestJS)   │
                 └───┬──────┬───┘
     internal HTTP │      │
   ┌───────────────▼──┐   │        ┌─────────────────────┐
   │   ai-service     │   ├───────►│ packages/contracts  │
   │ (Python/FastAPI) │   │        │ packages/config     │
   └────────┬─────────┘   ▼        └─────────────────────┘
            │        PostgreSQL
            ▼
      OpenAI API
```

The two application languages meet at exactly one place: the internal HTTP
contract below. Nothing else crosses the boundary — no shared process, no
shared database connection, no shared file.

Enforced boundaries:

1. **Only `ai-service` holds a provider credential.** The browser cannot
   reach a provider, and neither can `backend`: the OpenAI key, the prompts
   and the model routing exist only in the Python service's configuration. The
   API's validated configuration has no `llm` or `models` section at all, which
   an integration test asserts.

   > **This boundary moved twice.** The foundation kept `backend` free of AI
   > entirely, on the rule that the API dispatches analysis rather than
   > performing it. The first AI slice made it synchronous and put the provider
   > _inside_ the API process (TypeScript, `packages/ai-workflows`). The AI
   > implementation is now Python, in its own service, and the API is back to
   > delegating — synchronously, over HTTP. An analysis request occupies a
   > request thread for the duration of the model call.

2. **No framework leaks into shared code.** `packages/contracts` imports Zod and
   nothing else — no NestJS, no React. `frontend` therefore consumes it safely.
3. **No circular dependencies.** `contracts` depends on nothing internal; the
   applications depend on packages. Nothing depends on an application. The
   Python service depends on no TypeScript package: it re-declares the contract
   in Pydantic, and shared fixtures keep the two definitions honest.
4. **The API and the AI service are independently executable.** The
   TypeScript applications share _packages_, never modules; the Python service
   shares nothing but the HTTP contract. Each has its own entry point,
   configuration schema and lifecycle.

## Module format: ESM

NestJS 12 ships as ESM only (`"type": "module"`, with no `require` condition in
its `exports`). Every Node-side workspace is therefore ESM, which has two
consequences visible throughout the code:

- Relative imports carry an explicit `.js` extension (`./config/index.js`) —
  this is the emitted path, as Node ESM requires fully specified specifiers.
- `__dirname` does not exist; `import.meta.dirname` is used instead.

`frontend` is bundled by Vite and uses `moduleResolution: "bundler"`; the
Node-side workspaces use `module`/`moduleResolution: "node16"`, which honours
the `exports` field of each workspace package.

## Cross-package resolution

Shared packages compile to `dist/` (JavaScript plus `.d.ts`) and are consumed
through pnpm workspace links and their `exports` fields. There are deliberately
**no TypeScript `paths` aliases**: a single resolution mechanism means one
source of truth and no risk of two copies of the same type. `pnpm build` runs in
dependency order, so packages are built before the applications that import
them.

## Configuration

Every process validates its environment once, at startup:

- `backend` → `src/config/env.schema.ts` (Zod, via `loadEnv()` from
  `packages/config`)
- `ai-service` → `ai_service/config.py` (pydantic-settings, with the same
  upward search for the root `.env` and the same precedence rule: values
  already in the process environment win over the file)

A misconfigured process fails immediately with a readable list of problems
rather than at the first request. A single `.env` at the repository root serves
every workspace, including Vite (`envDir: '../'`) and the Python service.

Variables are owned by exactly one process. `LLM_*` and `OPENAI_*` belong to
`ai-service`; `AI_SERVICE_ENABLED`, `AI_SERVICE_URL` and the two timeouts
belong to `backend`; `AI_SERVICE_HOST`, `AI_SERVICE_PORT` and
`AI_SERVICE_TOKEN` are read by the AI service, with the API reading the token
too because it has to present it. Nothing reads a variable it does not own.

Nothing secret is required to start the stack: with `AI_SERVICE_ENABLED=false`
and `LLM_PROVIDER=none` everything boots and analysis answers `503`, and
`DATABASE_ENABLED=false` starts the API with no database at all.

## Persistence

TypeORM with PostgreSQL. Two rules are structural, not conventions:

- `synchronize` is hard-coded `false` in `buildTypeOrmOptions`, so the schema is
  never inferred from entities.
- Migrations are explicit and run on demand
  (`pnpm --filter @email-ai/api migration:run`). `migrationsRun` is `false`.

`src/database/data-source.ts` exists only for the TypeORM CLI; the running
application gets its connection from `DatabaseModule`.

Two entities exist: `Email` and `Analysis`. See
[data-model.md](./data-model.md) for columns, the de-duplication index, the
one-in-flight-analysis guarantee and the status transitions.

## Not yet implemented

Asynchronous/queued analysis · the `classification`, `summarization` and
`conflict_resolution` operations (models configured and validated in the AI
service, no caller) ·
PDF, image and spreadsheet parsing · OCR · the human review queue · business
records and audit history · authentication and authorization · the dashboard
features under `frontend/src/features/`.

Directories for these carry a `.gitkeep` describing their intent; none contains
stub code that could be mistaken for working functionality.

## Request path in development

The dashboard calls the API at its absolute URL (`VITE_API_BASE_URL`) in both
development and production, so there is one request path to reason about. CORS
is therefore explicit: the dev origin must appear in the API's `CORS_ORIGINS`
(it does by default). There is intentionally no Vite dev proxy — a second,
same-origin path would have made the effective base URL ambiguous.

## Dependencies declared ahead of use

There are none left on the AI path. The TypeScript AI package declared
`@langchain/langgraph` and `@langchain/core` before any code imported them;
both left with it. The Python service deliberately does **not** take a graph
dependency: one operation, called once per email, needs no graph orchestration,
and LangGraph can be added when a workflow actually branches.

## AI integration

One provider, one port, one model per operation — all of it in
`ai-service`, none of it in TypeScript.

### The internal HTTP contract

|             |                                                                                         |
| ----------- | --------------------------------------------------------------------------------------- |
| Endpoint    | `POST /internal/v1/ai/extract` on `AI_SERVICE_URL`                                      |
| Request     | `{ operation, email: { id, sender, subject, receivedAt, bodyText } }`                   |
| Response    | `{ status, extraction, validationErrors, failureCode, failureMessage, operation }`      |
| Declared in | `packages/contracts/src/ai-service.ts` (Zod) and `ai_service/models/wire.py` (Pydantic) |
| Pinned by   | `test/fixtures/ai-service/*.json`, validated by both suites                             |

The API sends the email and the operation it wants; the AI service returns
validated structured output plus accounting for the model call. The API
persists the result and sets the analysis status. Credentials never cross this
boundary in either direction, and the response carries no prompt.

`operation` is explicit in the request rather than implied by the path: a
request naming an operation with no implementation is rejected with `422`
instead of quietly running a different one.

Status codes carry meaning the API depends on:

| From the AI service           | The API records                                                     |
| ----------------------------- | ------------------------------------------------------------------- |
| `200` + `status: "succeeded"` | `completed`, after re-validating the extraction and persisting it   |
| `200` + `status: "failed"`    | `failed` with the reported `failureCode` and any `validationErrors` |
| `503`                         | `failed` with `configuration`, and answers the client `503`         |
| `401`/`403`/`404`             | `failed` with `configuration` (token, URL or version mismatch)      |
| `422`                         | `failed` with `invalid_response` — the two deployments disagree     |
| other `4xx`/`5xx`             | `failed` with `unavailable`                                         |
| unreachable                   | `failed` with `unavailable`                                         |
| no answer in time             | `failed` with `timeout`                                             |
| off-contract body             | `failed` with `invalid_response`                                    |

An analysis is never marked `completed` unless the AI service reported success,
the extraction re-validated against the shared schema **and** the database
write succeeded. `HttpAiServiceClient` bounds the call twice — a connect
deadline and a response deadline — using `undici` rather than global `fetch`,
because one combined deadline cannot distinguish "cannot reach it" from "it is
thinking", and a short combined deadline would abort every healthy extraction.

### Who owns what

`ai-service` owns:

- `ModelRegistry` — the only place that knows model identifiers. It maps each
  AI operation to a model, validates the whole table at startup, and exposes
  `model_for(operation)`. Services ask for an operation and never for a model
  name, so re-pointing an operation touches no service and no service reads the
  environment.
- `StructuredOutputProvider` — the port the services depend on. A request names
  an **operation**, not a model.
- `OpenAiStructuredProvider` — the only adapter, built on the official `openai`
  Python SDK and the **Responses API** (`responses.parse`). Decoding is
  constrained with Structured Outputs: a strict JSON Schema generated from the
  Pydantic contract.
- `UnconfiguredProvider` — used when no credentials are set. It raises on every
  call, so the service still boots (health checks stay green) and a request
  fails loudly rather than returning a fabricated result.
- `verify_extraction_integrity` — deterministic post-checks, no model involved.
- The prompt, in `prompts/`, outside any route or adapter.

`backend` owns the lifecycle: the atomic claim, the single terminal
transition, idempotency, the one-in-flight guarantee, boundary validation of
the AI service's response, failure-code mapping and persistence.

### Operation routing

| Operation             | Default model | Status                    |
| --------------------- | ------------- | ------------------------- |
| `classification`      | `gpt-6-luna`  | configured, **no caller** |
| `extraction`          | `gpt-6-sol`   | **implemented**           |
| `summarization`       | `gpt-6-luna`  | configured, **no caller** |
| `conflict_resolution` | `gpt-6-astra` | configured, **no caller** |

Every model is overridable per operation (`OPENAI_MODEL_*`). The identifiers
carried over unchanged from the TypeScript registry after confirming that all
three exist, are served by the Responses API and support Structured Outputs.
Defaults were chosen from OpenAI's published per-1M-token prices read on
2026-10-15 — cheapest tier for the two operations that produce a short answer
from text already in front of the model, mid tier for the one whose output must
satisfy a strict sixteen-field schema, most capable tier for the one that
weighs contradictions. Prices move; `.env.example` records what was read and
when.

Three of the four operations have **no caller yet**. Their models are
configured and validated at startup — a typo fails loudly rather than on the
day the operation ships — but nothing invokes them, and the extract endpoint
rejects them. `GET /health/ready` on the AI service reports both the routing
table and `implementedOperations`, so the gap is visible at runtime rather than
only in this document.

**No silent fallback.** There is no fallback model. If a configured model does
not exist, is not available to the account, or cannot do Structured Outputs on
the Responses API, the request fails with a configuration error naming the
model and the operation. Quietly retrying on a different (likely pricier)
model would hide the misconfiguration and distort cost.

### Why the result is validated three times, then checked a fourth

1. **Structured Outputs** constrains decoding: object shape, property names,
   types, `required`, `additionalProperties: false` — and, unlike some
   providers, `enum` membership. The schema is generated from the Pydantic
   contract, so it cannot drift from what validates the answer.
2. **Pydantic** re-validates the output inside the AI service. The contract is
   the authority on usability, and `output_parsed` is absent on refusals and
   truncation.
3. **`verify_extraction_integrity`** then checks the extraction against itself,
   deterministically and without a model call: a value asserted with no
   evidence, a field listed as both missing and populated, a "conflict" with
   one value, an invented field name — and above all a conflicted field that
   was nonetheless given a single value, which is the model silently
   overwriting contradictory source evidence. Any finding fails the extraction.
4. **Zod, in the API**, validates the response that arrives over HTTP, because
   it crossed a process boundary and because the schema — not the sender —
   decides what may be written to `analyses.extracted_data`.

Steps 2–3 are why no conflict-resolution model call is needed to notice that
the model contradicted itself. Model calls are reserved for judgement that
application code genuinely cannot make. Step 4 is not redundancy for its own
sake: it is the same rule the API applies to every other input it does not
control.

### Preventing schema drift across languages

The extraction contract and the internal HTTP contract are declared twice, once
per language. Three things keep them in step:

- **Shared fixtures.** `test/fixtures/` holds the worked examples. The
  TypeScript suite validates them against the Zod schemas; the Python suite
  validates the same files against the Pydantic models. Both round-trip them
  and assert the serialised form is unchanged, so a renamed or re-cased field
  fails on the other side.
- **Vocabulary tests.** The Python suite reads
  `packages/contracts/src/analyses.ts` and `ai-operations.ts` and asserts that
  every failure code it can return and every operation it can route is declared
  there.
- **Boundary validation.** Anything that slips past both is caught at runtime
  as `invalid_response` rather than written to the database.

**Safe logging, in both languages.** Logs carry ids, operation, model,
provider, status, token counts, latency and failure codes. They never carry the
API key, the internal token, the prompt, the email body, or the `evidence`
spans — which reproduce message content and are persisted only. Two
consequences worth noting: the AI service reports _which_ fields a rejected
request got wrong rather than their values, and the API logs only issue paths
when a response fails the contract, never the body.

**Protecting the AI service.** It binds to `127.0.0.1` by default, and refuses
to start on any other address unless `AI_SERVICE_TOKEN` is set — a service that
makes paid model calls must not be open to whatever can route to it. The token
is compared in constant time, applies to the AI endpoints only (probes stay
open), and travels as a header, never in a payload. Deployments that cannot
keep it on loopback should set the token _and_ restrict the network; the
endpoint is internal and has no business being reachable from the internet.
