# AI service (`ai-service`)

The platform's AI operations: OpenAI provider integration, operation-to-model
routing and structured email extraction. Python 3.11, FastAPI, Pydantic and the
official OpenAI SDK.

Everything AI-specific lives here. The NestJS API (`backend`) owns the HTTP
surface, the database and the analysis lifecycle; it calls this service over an
internal HTTP contract and holds no provider credential, no model name and no
prompt.

## What is implemented

| Operation             | Model variable                     | Default       | Status                      |
| --------------------- | ---------------------------------- | ------------- | --------------------------- |
| `classification`      | `OPENAI_MODEL_CLASSIFICATION`      | `gpt-6-luna`  | configured, **no caller**   |
| `extraction`          | `OPENAI_MODEL_EXTRACTION`          | `gpt-6-sol`   | **implemented**             |
| `summarization`       | `OPENAI_MODEL_SUMMARIZATION`       | `gpt-6-luna`  | configured, **no caller**   |
| `conflict_resolution` | `OPENAI_MODEL_CONFLICT_RESOLUTION` | `gpt-6-astra` | configured, **no caller**   |

All four are validated at startup, so a typo fails loudly rather than on the day
that operation ships. Only `extraction` has an endpoint: a request naming any
other operation is rejected with `422`. `GET /health/ready` reports both the
routing table and `implementedOperations`, so the gap is visible at runtime.

**No fallback model.** If a configured model does not exist, is not available to
the account, or cannot do Structured Outputs on the Responses API, the request
fails with a configuration error naming the model and the operation. Nothing is
silently substituted.

## Setup

Requires Python 3.11+ (3.11 is what the lock file was built with).

```bash
cd ai-service
python3.11 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.lock   # reproducible
.venv/bin/python -m pip install -e '.[dev]'            # tooling, editable install
```

`requirements.lock` pins the full transitive closure; `pyproject.toml` pins the
direct dependencies and holds the Ruff, mypy and pytest configuration.

## Running

```bash
.venv/bin/python -m ai_service.main              # host/port from configuration
.venv/bin/uvicorn ai_service.main:app --reload   # development, auto-reload
```

From the repository root: `pnpm dev:ai` (same thing, with this venv).

Interactive API docs at `http://127.0.0.1:8000/docs`.

## Configuration

Read once at startup from the **repository-root `.env`** — the same file the API,
the worker and Vite use — with the process environment taking precedence. The
variable names are unchanged from the TypeScript implementation, so an existing
`.env` works as-is.

| Variable                           | Default           | Purpose                                                        |
| ---------------------------------- | ----------------- | -------------------------------------------------------------- |
| `LLM_PROVIDER`                     | `none`            | `none` or `openai`. `none` keeps the service bootable.         |
| `OPENAI_API_KEY`                   | —                 | Credential. `LLM_API_KEY` is accepted as a fallback.           |
| `LLM_TIMEOUT_MS`                   | `60000`           | Per-request deadline for the model call.                        |
| `LLM_MAX_OUTPUT_TOKENS`            | `16000`           | Output token ceiling.                                           |
| `LLM_MAX_RETRIES`                  | `2`               | SDK retries on 429/5xx/connection errors.                       |
| `LLM_MAX_INPUT_CHARS`              | `200000`          | Prompt ceiling. Oversized input is rejected, never truncated.   |
| `OPENAI_MODEL_*`                   | see table above   | One model per operation. Empty means "use the default".         |
| `AI_SERVICE_HOST`                  | `127.0.0.1`       | Loopback by default: this service is internal.                  |
| `AI_SERVICE_PORT`                  | `8000`            | Listen port.                                                    |
| `AI_SERVICE_TOKEN`                 | —                 | Shared bearer token. **Required** on a non-loopback host.       |
| `LOG_LEVEL`                        | `info`            | Standard level names; `warn` is accepted.                       |
| `LANGSMITH_TRACING`                | `false`           | Opt-in. See [LangSmith tracing](#langsmith-tracing) below.      |
| `LANGSMITH_API_KEY`                | —                 | Required for tracing to actually happen.                        |
| `LANGSMITH_PROJECT`                | `email-ai-platform` | Groups traces in the LangSmith UI.                             |
| `LANGSMITH_ENDPOINT`               | —                 | Only for a self-hosted/EU LangSmith instance.                    |

Two rules are enforced rather than documented:

- **The service refuses to start unauthenticated on a reachable address.** If
  `AI_SERVICE_HOST` is not loopback and `AI_SERVICE_TOKEN` is unset, startup
  fails with a message saying so. A service that performs paid model calls must
  not be open to whatever can route to it.
- **Missing credentials do not block startup.** With `LLM_PROVIDER=none` the
  service runs and health checks pass; every AI request answers `503` naming the
  settings to supply. It never returns a fabricated extraction.

## Endpoints

| Method | Path                        | Auth    | Purpose                                     |
| ------ | --------------------------- | ------- | ------------------------------------------- |
| `GET`  | `/health`                   | none    | Liveness.                                   |
| `GET`  | `/health/ready`             | none    | Provider configuration and routing table.   |
| `POST` | `/internal/v1/ai/extract`   | bearer  | Run extraction on one email.                |

Probes are unauthenticated on purpose; the AI endpoints require the token
whenever one is configured, compared in constant time.

`POST /internal/v1/ai/extract` answers `200` with the **outcome** of the run —
check `status`. `failed` is a recorded outcome (refusal, timeout, rate limit,
unusable or self-contradictory output) that the API persists. `503` means the
service itself is misconfigured and no email will succeed until an operator
acts. `422` means the request did not match the contract.

```jsonc
// Request
{ "operation": "extraction",
  "email": { "id": "…", "sender": "…", "subject": "…",
             "receivedAt": "2026-02-02T08:14:00.000Z", "bodyText": "…" } }

// Response (success)
{ "status": "succeeded",
  "extraction": { "classification": "shipment_update", "…": "…" },
  "validationErrors": null, "failureCode": null, "failureMessage": null,
  "operation": { "operation": "extraction", "provider": "openai",
                 "model": "gpt-6-sol-2026-09-01", "status": "succeeded",
                 "inputTokens": 1234, "latencyMs": 4210, "…": "…" } }
```

## How a result is validated

1. **Structured Outputs** constrains decoding: `responses.parse` builds a strict
   JSON Schema from `ShipmentExtraction` (`additionalProperties: false`, every
   property required) and OpenAI enforces object shape *and* enum membership.
2. **Pydantic** validates the result in application code. The contract — not the
   model — decides what is usable, and `output_parsed` is absent on refusals and
   truncation.
3. **`verify_extraction_integrity`** checks the extraction against itself,
   deterministically and with no model call: a value asserted with no evidence, a
   field listed as both missing and populated, a "conflict" with one value, an
   invented field name — and above all a conflicted field that was nonetheless
   given a single value, which is the model silently overwriting contradictory
   source evidence. Any finding fails the extraction with `invalid_output` and
   the details in `validationErrors`. Nothing is repaired.

That third step is why noticing a self-contradictory extraction costs no model
call, and why `conflict_resolution` is reserved for genuine semantic ambiguity.

## Tests, lint and types

```bash
.venv/bin/python -m pytest        # 206 tests
.venv/bin/ruff check .            # lint
.venv/bin/ruff format .           # format (--check in CI)
.venv/bin/mypy                    # strict
```

From the repository root: `pnpm test:ai`, `pnpm lint:ai`, `pnpm format:ai`,
`pnpm typecheck:ai`.

No test needs an API key and none makes a network call: the OpenAI client is
replaced at the single seam the provider exposes for it, and the suite asserts
that nothing key-shaped reaches a request, a log line or an error message.

`tests/test_contract_fixtures.py` validates the shared fixtures in
`test/fixtures/` — the same files the TypeScript suite validates against the Zod
schemas — so the Pydantic models and the API's contracts cannot drift apart
silently.

## LangSmith tracing

Off by default. Set `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` (from
https://smith.langchain.com/settings) to send every model call — the system
prompt, the email content, the parsed output, token usage and latency — to
LangSmith, under the `LANGSMITH_PROJECT` project. `LANGSMITH_TRACING=true`
with no key logs a startup warning and runs untraced rather than failing.

This is a separate channel from this service's own logs: the logger here
never carries a prompt or email content (see Logging below), but LangSmith is
exactly for inspecting that content when debugging or auditing a model's
behaviour, so tracing sends it there deliberately. Treat a LangSmith API key
with the same care as `OPENAI_API_KEY`.

The OpenAI client is wrapped with `langsmith.wrappers.wrap_openai` once, at
construction (`ai_service/providers/openai_provider.py`), which patches
`responses.parse` to emit a trace per call; each call also tags its
`operation` (`extraction`, …) as trace metadata. No tracing code runs, and
`langsmith` makes no network call, when `LANGSMITH_TRACING` is unset — the
test suite never sends a trace.

## Logging

Logs carry ids, operation, model, provider, status, token counts, latency and
failure codes. They never carry the API key, the prompt, the email body or the
`evidence` spans, which reproduce message content and are returned to the API
rather than logged. A rejected request reports *which* fields were invalid, not
their values.
