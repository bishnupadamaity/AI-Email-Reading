# API

Base URL: `http://localhost:3000/api` (prefix from `API_GLOBAL_PREFIX`).

Interactive documentation is generated from the code and served at
`/api/docs`, with the OpenAPI document at `/api/docs-json`. It is enabled by
`SWAGGER_ENABLED` and never served when `NODE_ENV=production`.

## Versioning

URI versioning: feature endpoints live under `/api/v1/...`. `/api/health` is
`VERSION_NEUTRAL`, because probes should not have to track an API version.
Requesting a feature route without its version (`/api/emails`) returns `404`.

## Validation

Request bodies, query strings and path parameters are validated by
`ZodValidationPipe` against the schemas in `@email-ai/contracts` — the same
schemas the rest of the system is typed against, so the HTTP boundary cannot
accept something the services would reject. Those schemas **are** the DTOs; the
OpenAPI document is generated from them with `z.toJSONSchema()`, so the
documentation cannot drift from the validation that actually runs.

A failure returns `400` with every problem listed at once:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    { "path": "bodyText", "message": "Invalid input: expected string, received undefined" },
    { "path": "receivedAt", "message": "Invalid ISO datetime" }
  ]
}
```

## Error shape

Every non-2xx response is normalised by `AllExceptionsFilter` into the
`ApiError` contract. Unexpected errors are logged with their stack server-side
and returned as a generic `500`; database errors, SQL and stack traces never
reach the client.

| Status | When                                                                       |
| ------ | -------------------------------------------------------------------------- |
| `400`  | Body, query or path parameter failed validation (malformed UUID included). |
| `404`  | No such resource.                                                          |
| `409`  | Duplicate `externalMessageId` for the same email account.                  |
| `500`  | Unexpected server error, reported without internals.                       |

## Endpoints

### `POST /api/v1/emails`

Validates and stores an email, together with a `pending` analysis record in the
same transaction. **No analysis is executed** — that arrives with the workflow
pipeline.

Request:

```json
{
  "externalMessageId": "<po-4821@acme-logistics.example>",
  "emailAccountId": null,
  "sender": "Acme Logistics <dispatch@acme-logistics.example>",
  "subject": "Shipment confirmation - PO 4821",
  "bodyText": "Container MSCU7654321 departs Rotterdam on 2 February 2026.",
  "receivedAt": "2026-02-01T09:30:00.000Z"
}
```

`sender`, `subject`, `bodyText` and `receivedAt` are required. `receivedAt` must
be an ISO-8601 timestamp with an offset. `externalMessageId` and
`emailAccountId` are optional and may be `null`.

`201` returns the created email, including its pending analysis:

```json
{
  "id": "28c76809-9dbf-481e-8237-e02c0bfba0e8",
  "externalMessageId": "<po-4821@acme-logistics.example>",
  "emailAccountId": null,
  "sender": "Acme Logistics <dispatch@acme-logistics.example>",
  "subject": "Shipment confirmation - PO 4821",
  "receivedAt": "2026-02-01T09:30:00.000Z",
  "processingStatus": "received",
  "createdAt": "2026-02-01T09:30:02.114Z",
  "bodyText": "Container MSCU7654321 departs Rotterdam on 2 February 2026.",
  "updatedAt": "2026-02-01T09:30:02.114Z",
  "latestAnalysis": {
    "id": "ae8a4d5c-5145-41e4-b2a7-ac5d4a96b5dc",
    "status": "pending",
    "createdAt": "2026-02-01T09:30:02.114Z"
  }
}
```

Re-posting the same `externalMessageId` for the same account returns `409`. See
[data-model.md](./data-model.md) for how that uniqueness is scoped.

### `GET /api/v1/emails`

Paginated list, most recently received first (`received_at DESC`, with `id` as a
tiebreaker so a row cannot appear on two pages).

| Query      | Default | Range   |
| ---------- | ------- | ------- |
| `page`     | `1`     | ≥ 1     |
| `pageSize` | `25`    | 1 – 100 |

```json
{
  "items": [{ "id": "…", "subject": "…", "processingStatus": "received" }],
  "page": 1,
  "pageSize": 25,
  "total": 4
}
```

List items **omit `bodyText`** — the column is excluded from the query, not
stripped afterwards.

### `GET /api/v1/emails/:id`

Returns one email including its body and `latestAnalysis`. `404` if unknown,
`400` if `:id` is not a UUID.

### `POST /api/v1/emails/:id/analyze`

Runs extraction on a stored email and persists the result. **Synchronous**: the
request is held for the duration of the model call (bounded by the AI service's
`LLM_TIMEOUT_MS`, and by the API's `AI_SERVICE_REQUEST_TIMEOUT_MS` above it).
Takes no body.

The extraction itself happens in the Python AI service (`apps/ai-service`); the
API sends the stored email, validates what comes back and persists it. Requires
both sides configured — see [Configuring AI](#configuring-ai).

Returns `200` with the analysis. **Check the `status` field**: a `200` means the
run was performed and its outcome recorded, not that extraction succeeded. A
`failed` analysis is a recorded outcome, not a transport error, and returning it
in the body is what lets a client (or a reviewer) see _why_ it failed.

```json
{
  "id": "ae8a4d5c-5145-41e4-b2a7-ac5d4a96b5dc",
  "emailId": "28c76809-9dbf-481e-8237-e02c0bfba0e8",
  "status": "completed",
  "extractedData": {
    "classification": "shipment_update",
    "summary": "Container MSCU7654321 departed Rotterdam for Singapore.",
    "containerNumber": { "value": "MSCU7654321", "evidence": "Container:      MSCU7654321" },
    "originPort": { "value": "Rotterdam", "evidence": "Port of load:   Rotterdam (NLRTM)" },
    "shippingLine": { "value": null, "evidence": null },
    "estimatedArrival": { "value": "2026-02-24", "evidence": "ETA:            24 February 2026" },
    "missingFields": [{ "field": "shippingLine", "reason": "not stated in the email" }],
    "conflicts": []
  },
  "validationErrors": null,
  "modelName": "gpt-6-sol",
  "modelMetadata": {
    "provider": "openai",
    "model": "gpt-6-sol-2026-09-01",
    "inputTokens": 1234,
    "outputTokens": 567,
    "cacheReadInputTokens": 128,
    "latencyMs": 4210,
    "stopReason": "completed"
  },
  "operations": [
    {
      "operation": "extraction",
      "provider": "openai",
      "model": "gpt-6-sol-2026-09-01",
      "status": "succeeded",
      "failureCode": null,
      "inputTokens": 1234,
      "outputTokens": 567,
      "cachedInputTokens": 128,
      "reasoningTokens": 64,
      "latencyMs": 4210,
      "stopReason": "completed",
      "completedAt": "2026-02-02T08:20:05.210Z"
    }
  ],
  "failureCode": null,
  "failureMessage": null,
  "startedAt": "2026-02-02T08:20:01.000Z",
  "completedAt": "2026-02-02T08:20:05.210Z"
}
```

Every extracted field is `{ value, evidence }`, where `null` means the email did
not state it — nothing is inferred. Conflicting values are listed in
`conflicts` with the field left `null`, because resolving them is a human
decision.

`operations` holds one record per model call, naming the model that actually
served it (the id the provider reported, so an alias resolving to a dated
snapshot is captured as what really ran). `modelName` and `modelMetadata` are
retained unchanged for existing clients and describe the operation that
produced the result; `operations` is the field to read when more than one model
runs. Both are `null` on analyses that never ran, and `operations` is `null` on
analyses created before per-operation accounting.

#### Repeated requests

| Current state | Behaviour                                                              |
| ------------- | ---------------------------------------------------------------------- |
| `pending`     | Claimed and run.                                                       |
| `processing`  | `409` — one analysis at a time per email.                              |
| `completed`   | `200` with the stored result; **the provider is not called again**.    |
| `failed`      | A new run starts, as a new row; the failed attempt is kept as history. |

Re-running an already-completed analysis is deliberately not exposed: it would
spend tokens on an accidental double-click. A forced re-run can be added later
behind an explicit flag.

#### Failure outcomes

Recorded on the analysis and returned with `200`:

| `failureCode`      | Cause                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| `timeout`          | Provider did not answer within `LLM_TIMEOUT_MS`.                                    |
| `rate_limited`     | Provider rate-limited the request.                                                  |
| `unavailable`      | Provider unreachable or returned a server error.                                    |
| `input_too_large`  | Prompt above `LLM_MAX_INPUT_CHARS`. Never silently truncated.                       |
| `refused`          | The model declined to process the email.                                            |
| `invalid_response` | No parseable structured output, or the output was truncated.                        |
| `invalid_output`   | Output failed the shared schema **or** contradicted itself; see `validationErrors`. |
| `persistence`      | Extraction succeeded but could not be stored.                                       |

Returned as HTTP errors instead:

| Status | Cause                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `:id` is not a UUID.                                                                                                                     |
| `404`  | No such email.                                                                                                                           |
| `409`  | An analysis for this email is already in progress.                                                                                       |
| `503`  | AI is not configured: `AI_SERVICE_ENABLED=false`, the AI service reported no provider, it rejected the API's token, or the URL is wrong. |

A `503` for an unconfigured deployment (`AI_SERVICE_ENABLED=false`) is raised
**before** the analysis is claimed, so the email's `pending` analysis is left
untouched and no attempt is recorded. A `503` originating from the AI service
is raised after the claim, so the attempt is recorded as `failed` with
`configuration` and a retry starts a new run.

`failureMessage` is written for operators: it never contains email content, the
prompt, or any credential. Codes arrive from the AI service and are persisted
as-is; a code the API does not recognise (an AI service newer than the API) is
recorded as `unavailable` rather than written through unchecked.

### `GET /api/v1/analyses/:id`

```json
{
  "id": "ae8a4d5c-5145-41e4-b2a7-ac5d4a96b5dc",
  "emailId": "28c76809-9dbf-481e-8237-e02c0bfba0e8",
  "status": "pending",
  "extractedData": null,
  "validationErrors": null,
  "modelName": null,
  "startedAt": null,
  "completedAt": null,
  "createdAt": "2026-02-01T09:30:02.114Z",
  "updatedAt": "2026-02-01T09:30:02.114Z"
}
```

Returns the stored result for an analysis, through the same mapper as the
analyze endpoint: `extractedData` once it has completed, `validationErrors` if
the model's output failed the schema, and `modelMetadata` whenever the provider
answered. All of them stay `null` for an analysis that has not run.
`404` if unknown, `400` if `:id` is not a UUID.

### `GET /api/health`, `GET /api/health/ready`

Unversioned liveness and readiness probes. `ready` reports each dependency as
`up`, `down` or `disabled` and responds `503` if an enabled one is unreachable.

Redis is intentionally absent from `ready`: the queue connection is opened on
first dispatch, so probing it here would create the connection purely to test
it. It joins the list when the queue is on a request path.

## Configuring AI

AI runs in `apps/ai-service` (Python/FastAPI), on OpenAI's **Responses API**
with Structured Outputs. The API calls it over an internal HTTP contract and
holds no provider credential, no model name and no prompt.

In your `.env`:

```bash
# apps/api — where to find the AI service
AI_SERVICE_ENABLED=true
AI_SERVICE_URL=http://127.0.0.1:8000
AI_SERVICE_TOKEN=                # optional on loopback; required otherwise

# apps/ai-service — the provider
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...            # LLM_API_KEY is accepted as a fallback
```

With `AI_SERVICE_ENABLED=false` (the default) everything else still works and
`POST /emails/:id/analyze` answers `503` with a message naming the settings to
set, on both sides. The API never returns a fabricated extraction when it is
unconfigured, and neither does the AI service.

Tuning knobs:

| Variable                        | Owned by   | Purpose                                                     |
| ------------------------------- | ---------- | ----------------------------------------------------------- |
| `AI_SERVICE_REQUEST_TIMEOUT_MS` | `apps/api` | Deadline for the AI service to answer. Above the one below. |
| `AI_SERVICE_CONNECT_TIMEOUT_MS` | `apps/api` | Deadline for reaching it at all.                            |
| `LLM_TIMEOUT_MS`                | AI service | Deadline for the model call.                                |
| `LLM_MAX_OUTPUT_TOKENS`         | AI service | Output ceiling.                                             |
| `LLM_MAX_RETRIES`               | AI service | SDK retries on 429/5xx.                                     |
| `LLM_MAX_INPUT_CHARS`           | AI service | Prompt ceiling; oversized input is rejected.                |
| `LLM_STALE_PROCESSING_MS`       | `apps/api` | When a `processing` analysis may be reclaimed.              |

All are documented in [.env.example](../.env.example).

### One model per operation

There is no global model setting. Each AI operation routes to its own model
through the registry in `apps/ai-service`, and each is overridable:

| Operation             | Variable                           | Default       | Status                    |
| --------------------- | ---------------------------------- | ------------- | ------------------------- |
| `classification`      | `OPENAI_MODEL_CLASSIFICATION`      | `gpt-6-luna`  | configured, no caller yet |
| `extraction`          | `OPENAI_MODEL_EXTRACTION`          | `gpt-6-sol`   | **implemented**           |
| `summarization`       | `OPENAI_MODEL_SUMMARIZATION`       | `gpt-6-luna`  | configured, no caller yet |
| `conflict_resolution` | `OPENAI_MODEL_CONFLICT_RESOLUTION` | `gpt-6-astra` | configured, no caller yet |

Analysing an email makes **one** model call, on the extraction model. The other
three operations are configured and validated at the AI service's startup — a
typo fails loudly — but nothing invokes them, and its extract endpoint rejects
a request naming one. `GET /health/ready` on the AI service reports the routing
table and which operations are implemented.

Defaults were picked from OpenAI's published per-1M-token prices read on
2026-10-15 (`gpt-6-luna` $0.10/$0.50, `gpt-6-sol` $2.00/$10.00, `gpt-6-astra`
$10.00/$50.00), and the identifiers were re-verified when the implementation
moved to Python: all three exist, are served by the Responses API and support
Structured Outputs. Prices change — verify before relying on them.

**No fallback model.** If a configured model does not exist, is not available
to the account, or cannot do Structured Outputs on the Responses API, the
request fails with a `503` naming the model and the operation. The platform
never silently substitutes another model.

### The internal AI endpoint

Not part of the public API, and not reachable from the browser. Documented here
because the two services are deployed together.

| Method | Path                      | Auth   | Purpose                          |
| ------ | ------------------------- | ------ | -------------------------------- |
| `GET`  | `/health`                 | none   | AI service liveness.             |
| `GET`  | `/health/ready`           | none   | Provider configuration, routing. |
| `POST` | `/internal/v1/ai/extract` | bearer | Run extraction on one email.     |

Request and response schemas live in `packages/contracts/src/ai-service.ts`
(Zod) and `ai_service/models/wire.py` (Pydantic), with shared fixtures in
`test/fixtures/ai-service/` validated by both test suites. See
[apps/ai-service/README.md](../apps/ai-service/README.md) for the full
description and [architecture.md](./architecture.md#the-internal-http-contract)
for how statuses map onto analysis failure codes.

## Analysing a seeded email

```bash
pnpm infra:up
pnpm --filter @email-ai/api migration:run
pnpm --filter @email-ai/api seed          # three sample business emails

# Two processes: the AI service, then the API
pnpm dev:ai                               # http://127.0.0.1:8000
pnpm dev:api                              # http://localhost:3000/api

# Confirm the AI service is configured and which model extraction routes to
curl -s http://127.0.0.1:8000/health/ready

# Pick a seeded email, then analyse it
EMAIL_ID=$(curl -s 'http://localhost:3000/api/v1/emails?pageSize=1' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["items"][0]["id"])')

curl -X POST "http://localhost:3000/api/v1/emails/$EMAIL_ID/analyze"

# Inspect the stored result afterwards
curl "http://localhost:3000/api/v1/emails/$EMAIL_ID"      # latestAnalysis
curl "http://localhost:3000/api/v1/analyses/<analysisId>"
```

The three seeded emails exercise the interesting paths: one complete shipment,
one missing its container and dates (expect entries in `missingFields`), and one
stating two different containers, weights and ETAs (expect entries in
`conflicts` with those fields left `null`).

## Sample requests

With the API running (`pnpm dev:api`) and infrastructure up (`pnpm infra:up`):

```bash
# Ingest
curl -X POST http://localhost:3000/api/v1/emails \
  -H 'Content-Type: application/json' \
  -d '{"sender":"dispatch@acme.example","subject":"PO 4821",
       "bodyText":"Container MSCU7654321 departs Rotterdam.",
       "receivedAt":"2026-02-01T09:30:00.000Z"}'

# List
curl 'http://localhost:3000/api/v1/emails?page=1&pageSize=10'

# Detail
curl http://localhost:3000/api/v1/emails/<id>

# Analysis
curl http://localhost:3000/api/v1/analyses/<id>
```

Three realistic business emails (complete, incomplete and self-contradicting)
can be loaded with `pnpm --filter @email-ai/api seed`. The script refuses to
run when `NODE_ENV=production`.

### What is checked without a model

Inside the AI service, after the extraction validates against the Pydantic
contract, the result is checked against itself — deterministically, with no
extra model call:

- a value recorded without the evidence span it came from;
- a field reported in `conflicts` that nonetheless carries a single value,
  which would mean the model silently resolved a conflict and discarded
  contradictory evidence;
- a field listed in `missingFields` that carries a value, or listed as both
  missing and conflicting;
- a "conflict" with fewer than two values, or a field name that is not part of
  the extraction.

Any finding fails the analysis with `invalid_output` and the details in
`validationErrors`, which the API persists as reported. Nothing is repaired.
This is why noticing a self-contradictory extraction costs no model call — the
`conflict_resolution` model is reserved for genuine semantic ambiguity, and is
not yet invoked.

## Not yet implemented

Endpoints for attachments, ingestion from a provider, the review queue,
business records, audit logs, authentication and users. The
`classification`, `summarization` and `conflict_resolution` operations have
models configured in the AI service but no caller and no endpoint.

## Conventions for new endpoints

- Validate input with a Zod schema from `packages/contracts` via
  `ZodValidationPipe`; do not introduce a second validation vocabulary.
- Return the list envelope (`paginatedSchema`) for collections and accept
  `page`/`pageSize` via `paginationQuerySchema`.
- Document responses with `openApiSchema(...)` so Swagger is derived from the
  contract rather than hand-written.
- Controllers handle HTTP only; business rules belong in a service.
