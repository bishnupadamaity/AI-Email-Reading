"""Deterministic integrity checks for an extraction.

Ported from `verifyExtractionIntegrity` in the TypeScript `ai-workflows`
package, rule for rule and message for message, so an analysis that failed
before still fails now with the same `validationErrors`.
"""

from ai_service.models.common import ValidationIssue
from ai_service.models.extraction import (
    EVIDENCED_ATTRIBUTES,
    EVIDENCED_FIELDS,
    ShipmentExtraction,
    attribute_for,
    contract_name,
)


def verify_extraction_integrity(extraction: ShipmentExtraction) -> list[ValidationIssue]:
    """Check an extraction for self-contradiction, deterministically.

    These are rules a model cannot be trusted to enforce about its own output,
    and none of them needs a model to check — so none of them costs a call:

    - A value asserted without evidence. Evidence is the whole point of the
      contract; a bare value cannot be reviewed.
    - A field listed in ``conflicts`` that nonetheless carries a single value.
      That is the model silently picking a winner and overwriting contradictory
      source evidence, which is exactly the decision a human is supposed to
      make.
    - A field listed in ``missingFields`` that carries a value, or vice versa.
    - A conflict with fewer than two values, which is not a conflict.
    - Field names in ``conflicts`` or ``missingFields`` that are not fields of
      the extraction, which means the model invented a key.

    Returns one issue per problem; an empty list means the extraction is
    internally consistent. The caller decides what to do — this function
    neither repairs nor discards anything.
    """
    issues: list[ValidationIssue] = []

    for attribute in EVIDENCED_ATTRIBUTES:
        entry = getattr(extraction, attribute)
        if entry.value is not None and entry.evidence is None:
            field = contract_name(attribute)
            issues.append(
                ValidationIssue(
                    path=f"{field}.evidence",
                    message=(
                        f'A value was recorded for "{field}" without the supporting '
                        "text it was read from."
                    ),
                )
            )

    conflicted_fields: set[str] = set()

    for index, conflict in enumerate(extraction.conflicts):
        conflicted_fields.add(conflict.field)

        if conflict.field not in EVIDENCED_FIELDS:
            issues.append(
                ValidationIssue(
                    path=f"conflicts.{index}.field",
                    message=f'"{conflict.field}" is not a field of the extraction.',
                )
            )
            continue

        if len(conflict.values) < 2:
            issues.append(
                ValidationIssue(
                    path=f"conflicts.{index}.values",
                    message=(
                        f'A conflict on "{conflict.field}" must list at least two '
                        f"differing values; {len(conflict.values)} given."
                    ),
                )
            )

        if _value_of(extraction, conflict.field) is not None:
            issues.append(
                ValidationIssue(
                    path=conflict.field,
                    message=(
                        f'"{conflict.field}" is reported as conflicting, but a single '
                        "value was also recorded. Conflicting evidence must be "
                        "preserved for review, not resolved."
                    ),
                )
            )

    for index, missing in enumerate(extraction.missing_fields):
        if missing.field not in EVIDENCED_FIELDS:
            issues.append(
                ValidationIssue(
                    path=f"missingFields.{index}.field",
                    message=f'"{missing.field}" is not a field of the extraction.',
                )
            )
            continue

        if _value_of(extraction, missing.field) is not None:
            issues.append(
                ValidationIssue(
                    path=missing.field,
                    message=(
                        f'"{missing.field}" is listed as missing, but a value was recorded for it.'
                    ),
                )
            )

        if missing.field in conflicted_fields:
            issues.append(
                ValidationIssue(
                    path=f"missingFields.{index}.field",
                    message=f'"{missing.field}" is listed as both missing and conflicting.',
                )
            )

    return issues


def _value_of(extraction: ShipmentExtraction, contract_field: str) -> str | None:
    """The recorded value of an evidenced field, addressed by contract name."""
    attribute = attribute_for(contract_field)
    if attribute is None:  # pragma: no cover - guarded by the EVIDENCED_FIELDS check
        return None
    value: str | None = getattr(extraction, attribute).value
    return value
