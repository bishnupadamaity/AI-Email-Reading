# Data model

**Implemented:** `emails`, `analyses` (including extraction results).
**Planned:** `attachments`, `extracted_fields`, `review_items`, `business_records`,
`audit_logs`, and the email-account/tenant table — see [architecture.md](./architecture.md).

## Principles

- The schema is owned by explicit migrations in
  `apps/api/src/database/migrations/`. `synchronize` is permanently `false` and
  `migrationsRun` is `false`; migrations are applied on demand.
- Analysis output is kept separate from the email it describes, so re-running a
  workflow never mutates the source record and history is preserved.
- Every automated decision will be auditable: what was extracted, with what
  confidence, by which model, and who reviewed it.

## `emails`

| Column                | Type                      | Notes                                           |
| --------------------- | ------------------------- | ----------------------------------------------- |
| `id`                  | `uuid` PK                 | `pk_emails`, default `uuid_generate_v4()`       |
| `email_account_id`    | `uuid` NULL               | Account the message arrived on. No FK yet.      |
| `external_message_id` | `varchar(998)` NULL       | Provider message id, used for de-duplication.   |
| `sender`              | `varchar(320)`            | Verbatim `From`; bare address or `Name <addr>`. |
| `subject`             | `varchar(998)`            |                                                 |
| `body_text`           | `text`                    | Plain-text body.                                |
| `received_at`         | `timestamptz`             | When the provider received it, not when we did. |
| `processing_status`   | `email_processing_status` | Enum, default `received`.                       |
| `created_at`          | `timestamptz`             | `now()`                                         |
| `updated_at`          | `timestamptz`             | `now()`                                         |

Indexes: `idx_emails_received_at`, `idx_emails_processing_status`, and the
uniqueness index described below.

### Uniqueness of `external_message_id`

Message ids are **not** globally unique — two mailboxes legitimately receive the
same id — so uniqueness is scoped to the account:

```sql
CREATE UNIQUE INDEX uq_emails_account_external_message_id
  ON emails (email_account_id, external_message_id)
  NULLS NOT DISTINCT
  WHERE external_message_id IS NOT NULL;
```

Three decisions are doing work here:

1. **Scoped to `email_account_id`**, so the index keeps working unchanged once
   accounts exist. Today every row has `NULL` there.
2. **`NULLS NOT DISTINCT`** (PostgreSQL 15+) is what makes it de-duplicate
   _now_. Under default NULL semantics `(NULL, 'abc')` is distinct from
   `(NULL, 'abc')`, so duplicates would be accepted while accounts are unset.
3. **Partial** (`WHERE external_message_id IS NOT NULL`), so any number of
   emails may arrive without a message id.

A violation surfaces as HTTP `409`, never as a database error.

`email_account_id` has no foreign key yet because there is no accounts table.
Adding it is a later migration; the column and index do not change.

## `analyses`

| Column              | Type                | Notes                                    |
| ------------------- | ------------------- | ---------------------------------------- |
| `id`                | `uuid` PK           | `pk_analyses`                            |
| `email_id`          | `uuid` NOT NULL     | FK → `emails(id)` `ON DELETE CASCADE`    |
| `status`            | `analysis_status`   | Enum, default `pending`                  |
| `extracted_data`    | `jsonb` NULL        | Validated extraction, written on success |
| `validation_errors` | `jsonb` NULL        | Why the output was rejected, when it was |
| `model_name`        | `varchar(128)` NULL | Model that produced the output           |
| `started_at`        | `timestamptz` NULL  |                                          |
| `completed_at`      | `timestamptz` NULL  |                                          |
| `created_at`        | `timestamptz`       | `now()`                                  |
| `updated_at`        | `timestamptz`       | `now()`                                  |

Indexes: `idx_analyses_email_id`, `idx_analyses_status`.
Constraint: `fk_analyses_email` with `ON DELETE CASCADE` — deleting an email
removes its analyses rather than orphaning them.

`extracted_data` and `validation_errors` are `jsonb` rather than columns, but
they are not untyped: their shape is `shipmentExtractionSchema` and
`validationIssueSchema` from `packages/contracts`, mirrored in Pydantic by
`apps/ai-service` and validated on the way in. The API writes
`extracted_data` only after that validation passes, so a row either holds a
document satisfying the contract or holds `null`.

### One analysis per ingested email

Ingesting an email creates a companion `analyses` row with status `pending`, in
the **same transaction**. Both rows commit together or neither does — an email
with no analysis row would be invisible to the pipeline that later picks work
up, and a stray analysis would reference a row that was never stored.

This records intent only: nothing is dispatched and no model runs. The relation
is modelled as many-to-one (several runs per email over time), so the detail
endpoint exposes `latestAnalysis`.

## Relationships

```
emails 1─────n analyses          (implemented, ON DELETE CASCADE)

emails 1─────n attachments       (planned)
analyses 1───n extracted_fields  (planned)
analyses 1───0..1 review_items   (planned)
analyses 1───0..1 business_records (planned)
*      ──────n audit_logs        (planned, polymorphic subject)
```

## Enumerations

Defined once in `packages/contracts` and used to build the PostgreSQL enum
types, so the database, the API and the dashboard share one vocabulary:

- `email_processing_status` — `received`, `queued`, `analyzing`, `analyzed`,
  `needs_review`, `failed`. Only `received` is reachable today.
- `analysis_status` — `pending`, `processing`, `completed`, `failed`. All four
  are now reachable.
- `failure_code` (a plain column, not a PG enum) — `configuration`, `timeout`,
  `rate_limited`, `unavailable`, `input_too_large`, `refused`,
  `invalid_response`, `invalid_output`, `persistence`.

## Migrations

```bash
pnpm --filter @email-ai/api migration:show      # what is applied
pnpm --filter @email-ai/api migration:run       # apply
pnpm --filter @email-ai/api migration:revert    # undo the last one
pnpm --filter @email-ai/api migration:generate  # diff entities against the DB
```

`CreateEmailsAndAnalyses` was generated from the entities and then extended by
hand with the `uuid-ossp` extension and the `NULLS NOT DISTINCT` index, neither
of which TypeORM can express.

`AddAnalysisResultColumns` adds `model_metadata`, `failure_code`,
`failure_message` and `uq_analyses_email_in_flight`. Existing rows already
satisfy the new index — ingestion creates exactly one pending analysis per
email — so it needs no backfill.

The partial index **is** declared on the `Email` entity (`@Index(..., { unique:
true, where: ... })`). That is deliberate: without it, the next
`migration:generate` would not know the index exists and would propose dropping
it. With it, `migration:generate` reports no changes. The `NULLS NOT DISTINCT`
clause is the one part TypeORM cannot model, and it does not cause drift.

`down()` drops the index but deliberately leaves the extension in place, since
other objects may come to depend on it.
