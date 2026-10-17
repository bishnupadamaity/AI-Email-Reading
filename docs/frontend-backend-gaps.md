# Frontend/backend gaps

What the dashboard needs and the API does not provide yet.

The dashboard (`frontend`) is built against the implemented API surface only:
emails (create, list, detail, analyze), analyses (detail) and health. Every
feature below is either **disabled with an explanation in the UI** or **derived
in the browser and labelled as derived** — nothing is faked, and no action
reports success unless an endpoint performed it.

The single source of truth for this list in code is
[`frontend/src/lib/capabilities.ts`](../frontend/src/lib/capabilities.ts). It
declares each capability, whether an endpoint backs it, and the text the UI
shows when one does not. Implementing an endpoint means flipping `supported` to
`true` there and removing the workaround.

## How the dashboard copes today

### The workspace scan

`GET /v1/emails` returns the list projection, which carries **no analysis
reference and no body**. Anything that depends on extraction results — review
work, conflicts, missing information, the analyses table, activity, metrics —
therefore needs, per email:

1. `GET /v1/emails/:id` to learn `latestAnalysis.id`, then
2. `GET /v1/analyses/:id` to read the extraction.

That is **two requests per email**. `useWorkspaceScan` does this with a
concurrency limit of 6, bounded to the 25/50/100 most recent emails, writes
each result into the per-entity query cache, and reports its request count in
the UI. Every page built on it states the figures describe the scanned subset,
not the workspace.

This is the single biggest source of avoidable work in the client and the gap
worth closing first.

## Required endpoints

Ordered by how much they would improve the dashboard.

### 1. Analysis reference on the list projection

```
GET /v1/emails?page&pageSize
```

Add `latestAnalysis` (and ideally a small extraction digest:
`classification`, `conflictCount`, `missingCount`, `failureCode`) to
`emailSummarySchema`. This alone removes the 2N-request scan for the inbox,
review queue, conflicts and missing-information pages.

Affects: inbox, all emails, review queue, conflicts, missing information,
analyses, activity log.

### 2. Aggregate metrics

```
GET /v1/metrics/summary?from&to
```

Counts by email status, analysis status, conflicts, missing fields, failures by
`failureCode`, plus token/latency totals per operation and model. Without it,
the overview's KPI row and the pipeline counts are computed from the scan and
labelled "derived in the browser".

A daily time series (`GET /v1/metrics/volume?days`) would replace the client-side
bucketing behind the processing-activity chart.

Capability id: `aggregateMetrics`.

### 3. Server-side search, filter and sort

```
GET /v1/emails?q&status&classification&sender&from&to&sort&order
```

Today the list endpoint accepts only `page` and `pageSize`. Search and filters
run in the browser over loaded records, which the UI marks with a "No API" tag
and explains in each filter bar. Note that body search is impossible on the All
Emails page at all, because the list projection excludes `bodyText`.

Capability ids: `serverSideSearch`, `serverSideFilter`, `serverSideSort`.

### 4. Analyses collection and per-email history

```
GET /v1/analyses?page&pageSize&status&emailId
GET /v1/emails/:id/analyses
```

An analysis is reachable only by id. Failed attempts are kept as separate rows
and a retry creates a new one, so history exists in the database but cannot be
read. "View previous attempts" is disabled on the workspace and the analysis
detail page.

Capability ids: `analysisList`, `analysisHistory`.

### 5. Review queue and decisions

```
GET  /v1/review-items?reason&severity&status&assignee
POST /v1/review-items/:id/decision   { decision, note }
POST /v1/review-items/:id/assignee   { userId }
```

There is no `review_items` table. The review queue is derived from stored
analyses: an item is queued because it carries a conflict, a reported missing
field, validation errors or a failed run. Severity is assigned by the frontend.

`reviewDecisionSchema` in `packages/contracts` already defines the vocabulary
(`approved`, `corrected`, `rejected`), and `reviewReasonSchema` defines
`low_confidence`, `missing_required_field`, `validation_failed` and
`processing_error`. Two notes for whoever implements this:

- **Conflicting values has no reason variant.** The dashboard's derived reasons
  are `conflicting_values`, `missing_fields`, `validation_failed`,
  `analysis_failed` and `not_analyzed`; only the middle two map onto the
  contract. `reviewReasonSchema` needs a conflict variant.
- **`low_confidence` is unreachable.** Extraction returns evidence spans, not
  confidence scores, so no threshold rule can fire. Either drop the variant or
  add confidence to the extraction contract.

Approve, reject, mark-reviewed, correct and assign are all visibly disabled
with the reason, in the analysis workspace and the review detail.

Capability ids: `reviewQueue`, `reviewDecision`, `reviewerAssignment`.

### 6. Human corrections to extracted values

```
PATCH /v1/analyses/:id/fields/:field   { value, note }
```

Extraction results are immutable over the API, so the dashboard cannot
separate "AI suggested" from "human approved" — the extraction panel is
labelled **Unreviewed** throughout instead. This is also what blocks field-level
precision and recall on the evaluations page: there is no ground truth to score
against.

Capability id: `fieldEdit`.

### 7. Conflict resolution

```
POST /v1/analyses/:id/conflicts/:field/resolve   { value, note }
```

The extraction records every competing value and leaves the field `null`
deliberately. The conflicts page builds the side-by-side comparison and links to
the evidence, but "Resolve" is disabled: no endpoint records the choice, and the
dashboard never preselects a winner.

Worth noting for the implementation: `conflictSchema` carries one shared `note`
per conflict, not evidence per value. Per-value evidence spans would let the UI
show what supports each candidate instead of highlighting occurrences in the
body.

Capability id: `conflictResolution`.

### 8. Attachments and document extraction

```
GET  /v1/emails/:id/attachments
GET  /v1/attachments/:id
POST /v1/attachments/:id/extract
```

Nothing exists: no `attachments` table, no storage, no OCR, and
`POST /v1/emails` accepts a plain-text body only, so no stored email can have
one. The Documents page states this rather than rendering an empty inventory,
and the workspace says the same where attachments would appear.

Capability ids: `attachments`, `documentExtraction`.

### 9. Audit log

```
GET /v1/audit-logs?entityType&entityId&action&from&to
```

No `audit_logs` table is written. The Activity Log reconstructs a timeline from
`emails.created_at` and the analysis `created_at`/`started_at`/`completed_at`
columns — all the database keeps. Review actions, extraction corrections and
configuration changes are absent by necessity, which the page states.

Capability id: `auditLog`.

### 10. Evaluations

```
GET /v1/evaluations
GET /v1/evaluations/:id/results
```

No harness, dataset or endpoint. `test/evaluation-dataset/` is an empty
placeholder. The Evaluations page therefore splits what is **observed** (token
cost, latency, failure codes, how often extraction completed — real, from stored
analyses) from what needs a labelled set (accuracy, per-field precision and
recall, missing-field and conflict detection performance, model comparison),
and leaves the latter empty. No fabricated percentage appears anywhere.

Capability id: `evaluations`.

### 11. AI configuration (read-only)

```
GET /v1/config/ai
```

Model routing, timeouts and limits live in the AI service's environment. The AI
service reports its routing table on its own internal `GET /health/ready`, which
is not reachable from the browser. Settings therefore shows the **documented
defaults** from `docs/api.md`, marks each row "Not verified", and says plainly
that it cannot confirm this deployment's configuration.

If this endpoint is added it must return operation → model ids and the resolved
numeric limits **only**. It must never return credentials, and there must be no
endpoint that returns environment variables — masked or otherwise. The dashboard
does not ask for secrets and shows none, not even masked values it does not
have.

Capability ids: `modelConfigRead`, `settingsWrite`.

### 12. Authentication and users

```
POST /v1/auth/login
GET  /v1/users/me
```

The API has no authentication; every request is anonymous. The sidebar identity
is a placeholder labelled "No sign-in required", and the account menu says so.
Reviewer assignment and audit attribution both depend on this.

Capability id: `auth`.

### 13. Notifications

```
GET /v1/notifications
```

No notification store. The header bell lists attention signals computed from the
current scan and says as much in its footer.

Capability id: `notifications`.

## Things the dashboard deliberately does not ask for

- **A forced re-run of a completed analysis.** `docs/api.md` explains why it is
  not exposed: it would spend tokens on an accidental double-click. The button
  is disabled with that reason rather than hidden.
- **Any endpoint returning environment variables or secrets.** See §11.
- **A fabricated read/unread flag.** The inbox's read marker is explicitly
  browser-local (`localStorage`), explained on hover, and clearable from
  Settings. If a real one is wanted it needs a column and an endpoint.
- **Mailbox synchronisation.** There is no provider connection, so the UI shows
  no "last synced" time and Integrations reports "Not connected".

## Client-side workarounds to remove

Each of these exists only because of a gap above, and should be deleted when the
endpoint lands:

| Workaround                        | File                                                                            | Removed by               |
| --------------------------------- | ------------------------------------------------------------------------------- | ------------------------ |
| 2N-request scan                   | `hooks/use-workspace-scan.ts`                                                   | §1, §2                   |
| Derived counts and rates          | `lib/workspace.ts` (`summarize`)                                                | §2                       |
| Daily bucketing                   | `lib/workspace.ts` (`volumeSeries`)                                             | §2                       |
| Browser search/filter/sort        | `lib/email-filters.ts`                                                          | §3                       |
| Derived review items and severity | `lib/workspace.ts` (`reviewItems`), `lib/extraction.ts` (`deriveReviewSignals`) | §5                       |
| Derived activity timeline         | `lib/workspace.ts` (`activityEvents`)                                           | §9                       |
| Hardcoded routing defaults        | `lib/ai-config.ts`                                                              | §11                      |
| Local read markers                | `lib/seen-store.ts`                                                             | a real read-state column |

## Demo mode

Because analysis is optional (`AI_SERVICE_ENABLED=false` by default), a live
database can hold emails whose analyses have never run — leaving the extraction
workspace, conflicts, missing information and review queue with nothing to show.

Demo mode fills them with synthetic records built from the repository's own
contract fixtures (`test/fixtures/extraction/*.json`), widened with the email
bodies the evidence spans were quoted from so evidence highlighting behaves as
it does on real data. It is:

- off by default, per browser (`localStorage`), also togglable with `?demo=1`;
- announced by a persistent amber banner in the shell;
- marked per record with a `Demo` badge;
- completely inert — no request is sent to the API while it is on, and every
  write action is disabled with that reason.

Demo ids are prefixed `demo-` rather than being UUIDs, so a demo record can
never be mistaken for a stored one.
