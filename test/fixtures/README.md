# Shared contract fixtures

JSON read by **both** test suites:

- TypeScript — `packages/contracts/src/ai-service.spec.ts` and
  `extraction.spec.ts` validate every fixture against the Zod schemas.
- Python — `apps/ai-service/tests/test_contract_fixtures.py` validates the same
  files against the Pydantic models, and round-trips them to prove the
  serialised form is byte-identical to what it validated.

They exist so the two languages cannot drift apart silently: a field renamed,
re-cased or made non-nullable on one side fails the other side's suite. Add a
fixture whenever the contract grows a case worth pinning; never let one suite
have a fixture the other does not read.

| Directory     | Contract                                                      |
| ------------- | ------------------------------------------------------------- |
| `extraction/` | `shipmentExtractionSchema` / `ShipmentExtraction`             |
| `ai-service/` | The internal HTTP contract between the API and the AI service |

`invalid-*.json` files are expected to be **rejected** by both sides; every
other file must be accepted by both.
