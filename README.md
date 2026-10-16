# Email AI Platform

Processes business emails and their attachments, extracts structured
information with an LLM workflow, validates the result, and routes uncertain or
incomplete cases to a human review queue.

> **Status: first AI analysis slice, AI in Python.** Emails are ingested and
> persisted, and `POST /api/v1/emails/:id/analyze` runs a real LLM extraction
> (OpenAI, Responses API + Structured Outputs), validates it against the shared
> schema, and stores the result with the model that served it. The AI itself
> lives in **`apps/ai-service`** (Python, FastAPI, Pydantic); the NestJS API
> calls it over an internal HTTP contract and holds no provider credential.
> Each AI operation routes to its **own configurable model**; only `extraction`
> has a caller today. The run is **synchronous** — BullMQ comes next.
> Attachments, OCR, review workflows and the dashboard features are **not
> implemented**. See [docs/architecture.md](docs/architecture.md).

## Prerequisites

| Tool   | Version    | Notes                                                             |
| ------ | ---------- | ----------------------------------------------------------------- |
| Node   | >= 22.12   | Required by Vite 8 and by `import.meta.dirname`.                  |
| pnpm   | >= 10      | Workspaces. `corepack enable pnpm` if you do not have it.         |
| Python | >= 3.11    | For `apps/ai-service`. 3.11 is what the lock file was built with. |
| Docker | any recent | Only for local PostgreSQL and Redis.                              |

## Installation

```bash
pnpm install
cp .env.example .env     # local defaults; no secrets needed

# The Python AI service keeps its own virtual environment
cd apps/ai-service
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip install -e '.[dev]'
cd ../..
```

The AI service is a Python package outside the pnpm workspace, with its own
`pyproject.toml`, lock file, tests and tooling —
[apps/ai-service/README.md](apps/ai-service/README.md).

## Running it

```bash
pnpm infra:up                               # PostgreSQL + Redis in Docker
pnpm --filter @email-ai/api migration:run   # create the schema
pnpm dev                                    # web on :5173, API on :3000
```

Optionally load three sample business emails (complete, incomplete and
self-contradicting):

```bash
pnpm --filter @email-ai/api seed
```

### Enabling AI analysis

Analysis needs the Python AI service running and an OpenAI API key. In `.env`:

```bash
AI_SERVICE_ENABLED=true           # read by apps/api
AI_SERVICE_URL=http://127.0.0.1:8000
LLM_PROVIDER=openai               # read by apps/ai-service
OPENAI_API_KEY=sk-...             # LLM_API_KEY is accepted as a fallback
```

Then start the AI service alongside the API and analyse an email:

```bash
pnpm dev:ai                                    # AI service on :8000
curl -s http://127.0.0.1:8000/health/ready     # provider + routing table
curl -X POST http://localhost:3000/api/v1/emails/<id>/analyze
```

The key lives **only** in the AI service's configuration — never in the
browser, never in the API, never in a request payload. Without it the rest of
the API works normally and this endpoint answers `503` naming the settings to
supply, on both sides; it never returns a fabricated result. Walkthrough and
failure codes: [docs/api.md](docs/api.md).

### One model per AI operation

There is no global model setting. Each operation routes through a typed model
registry in the AI service and is independently overridable:

| Operation             | Variable                           | Default       | Status                    |
| --------------------- | ---------------------------------- | ------------- | ------------------------- |
| `classification`      | `OPENAI_MODEL_CLASSIFICATION`      | `gpt-6-luna`  | configured, no caller yet |
| `extraction`          | `OPENAI_MODEL_EXTRACTION`          | `gpt-6-sol`   | **implemented**           |
| `summarization`       | `OPENAI_MODEL_SUMMARIZATION`       | `gpt-6-luna`  | configured, no caller yet |
| `conflict_resolution` | `OPENAI_MODEL_CONFLICT_RESOLUTION` | `gpt-6-astra` | configured, no caller yet |

Analysing an email makes **one** model call, on the extraction model. Each call
is recorded in the analysis's `operations` array with the model, token usage and
latency. There is no fallback model: an unavailable or incompatible model fails
with a clear configuration error rather than being silently swapped. The AI
service validates all four operations at startup, so a typo in an unused one
fails loudly, and rejects a request for an operation it does not implement.

Then:

- Dashboard — <http://localhost:5173>
- Health — <http://localhost:3000/api/health>
- Emails — <http://localhost:3000/api/v1/emails>
- Swagger — <http://localhost:3000/api/docs>

The AI service and the worker are separate processes:

```bash
pnpm dev:ai        # Python AI service on :8000
pnpm dev:worker    # BullMQ consumer
```

### Running without Docker

The API and dashboard start with no infrastructure at all:

```bash
DATABASE_ENABLED=false pnpm dev
```

`/api/health` always responds; `/api/health/ready` reports the database as
`disabled`. The AI service starts without credentials too, reporting
`provider: disabled` on `/health/ready`. No LLM or email-provider credentials
are required to start anything.

> If port 3000 or 5173 is already in use on your machine, set `API_PORT` /
> change `server.port` in `apps/web/vite.config.ts`. The API exits with a clear
> `EADDRINUSE` error rather than starting half-configured.

## Commands

### Root

| Command             | Effect                                             |
| ------------------- | -------------------------------------------------- |
| `pnpm dev`          | Builds packages, then runs the web app and API.    |
| `pnpm dev:api`      | API only.                                          |
| `pnpm dev:web`      | Dashboard only.                                    |
| `pnpm dev:worker`   | Worker only.                                       |
| `pnpm dev:ai`       | Python AI service only (uses its own venv).        |
| `pnpm build`        | Builds every package and application in order.     |
| `pnpm typecheck`    | `tsc` across all workspaces.                       |
| `pnpm lint`         | ESLint across the repository.                      |
| `pnpm format`       | Prettier, in place. `pnpm format:check` to verify. |
| `pnpm test`         | Runs every configured TypeScript test suite.       |
| `pnpm test:ai`      | pytest, in the AI service's venv.                  |
| `pnpm lint:ai`      | Ruff lint. `pnpm format:ai` formats.               |
| `pnpm typecheck:ai` | mypy (strict) over the AI service.                 |
| `pnpm infra:up`     | Starts PostgreSQL and Redis.                       |
| `pnpm infra:down`   | Stops them. Add `-v` manually to drop volumes.     |
| `pnpm clean`        | Removes build output.                              |

### Per workspace

```bash
pnpm --filter @email-ai/api   dev | build | start | test | test:integration | seed | typecheck
pnpm --filter @email-ai/web   dev | build | preview | typecheck
pnpm --filter @email-ai/worker dev | build | start | typecheck

# The AI service is not a pnpm workspace; run its tooling from its venv
cd apps/ai-service && .venv/bin/python -m pytest
cd apps/ai-service && .venv/bin/ruff check . && .venv/bin/mypy
```

### Database migrations

The schema is owned by explicit migrations; `synchronize` is permanently off.

```bash
pnpm --filter @email-ai/api migration:show      # what is applied
pnpm --filter @email-ai/api migration:run       # apply pending migrations
pnpm --filter @email-ai/api migration:create    # hand-written migration
pnpm --filter @email-ai/api migration:generate  # diff entities against the DB
pnpm --filter @email-ai/api migration:revert    # undo the last one
```

The integration suite uses its own databases (`email_ai_test_<worker>`), created
on demand, so it never touches your development data.

## Layout

```
apps/
  web/         React + Vite dashboard       (@email-ai/web)
  api/         NestJS REST API              (@email-ai/api)
  ai-service/  Python AI service            (FastAPI; all AI operations)
  worker/      BullMQ consumer              (@email-ai/worker)
packages/
  contracts/             shared types and Zod schemas, incl. the AI contract
  document-processing/    parsing, OCR and file-validation abstractions
  config/                environment loading and validation
test/
  fixtures/   shared contract fixtures, validated by BOTH test suites
docs/       architecture, data model, API
```

## Architecture in one paragraph

The browser talks only to the API. The API owns endpoints, business rules,
persistence, the analysis lifecycle and job dispatch. Every AI operation
happens in the Python AI service, which the API calls over an internal HTTP
contract on a loopback (or network-restricted, token-authenticated) address:
**only that service holds a provider credential, a prompt or a model name**.
Shared TypeScript code lives in packages, with `contracts` framework-free and
safe for the browser; the AI service shares no code with it, re-declaring the
same contract in Pydantic with shared fixtures to prevent drift. Full detail,
including the dependency rules, the failure-code mapping and why the Node side
is ESM, is in [docs/architecture.md](docs/architecture.md).

## Configuration

All variables are documented in [.env.example](.env.example). A single `.env`
at the repository root serves every workspace — Vite and the Python service
included. Each process validates its environment once at startup (Zod via
`loadEnv()` in TypeScript, pydantic-settings in Python) and fails with a
readable list of problems rather than at the first request.

Each variable is owned by exactly one process: `LLM_*` and `OPENAI_*` belong to
the AI service, `AI_SERVICE_ENABLED`/`AI_SERVICE_URL` and the timeouts belong to
the API. Nothing reads a variable it does not own.

`.env` is gitignored. Do not commit real credentials.

## Notes for the next phase

- Analysis runs **inside the HTTP request** for now: the API calls the AI
  service synchronously. That is a deliberate, temporary step; moving the
  runner to `apps/worker` — which will call the same AI endpoint — is the next
  task, and the runner's claim/finish split is already shaped for it. See
  [docs/architecture.md](docs/architecture.md).
- The AI service takes **no graph dependency**. One operation called once per
  email needs no graph orchestration; LangGraph belongs in it the day a
  workflow actually branches, not before.
- Two processes now have to be running for analysis to work. `pnpm dev:ai`
  starts the AI service; `/health/ready` on it reports whether the provider is
  configured and which model each operation routes to.
- `apps/web` has no test runner configured yet; the API and `contracts` use
  Jest. `pnpm test` covers what is configured.
- Redis has no readiness check yet — see [docs/api.md](docs/api.md) for why.
