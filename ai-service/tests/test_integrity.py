"""Deterministic integrity checks.

Ported from `verify-extraction-integrity.spec.ts`: the rules a model cannot be
trusted to enforce about its own output, and none of which costs a model call.
"""

from typing import Any

import pytest

from ai_service.extraction.integrity import verify_extraction_integrity
from ai_service.models.extraction import EVIDENCED_FIELDS, ShipmentExtraction
from tests.conftest import load_fixture


def extraction(**overrides: Any) -> ShipmentExtraction:
    payload: dict[str, Any] = load_fixture("extraction/complete.json")
    payload.update(overrides)
    return ShipmentExtraction.model_validate(payload)


def paths(issues: list[Any]) -> list[str]:
    return [issue.path for issue in issues]


class TestConsistentExtractions:
    def test_accepts_a_complete_consistent_extraction(self) -> None:
        assert verify_extraction_integrity(extraction()) == []

    def test_accepts_an_extraction_with_nothing_stated(self) -> None:
        nothing = ShipmentExtraction.model_validate(load_fixture("extraction/nothing-stated.json"))

        assert verify_extraction_integrity(nothing) == []

    def test_accepts_conflicts_with_the_field_left_null(self) -> None:
        conflicting = ShipmentExtraction.model_validate(load_fixture("extraction/conflicting.json"))

        assert verify_extraction_integrity(conflicting) == []

    def test_accepts_a_null_value_with_no_evidence(self) -> None:
        # Absence is the normal case, not a problem.
        assert (
            verify_extraction_integrity(
                extraction(containerNumber={"value": None, "evidence": None})
            )
            == []
        )


class TestEvidence:
    def test_rejects_a_value_recorded_without_evidence(self) -> None:
        issues = verify_extraction_integrity(
            extraction(vesselName={"value": "MV Northern Star", "evidence": None})
        )

        assert paths(issues) == ["vesselName.evidence"]
        assert "without the supporting text" in issues[0].message

    def test_reports_every_unevidenced_field_not_just_the_first(self) -> None:
        issues = verify_extraction_integrity(
            extraction(
                vesselName={"value": "MV Northern Star", "evidence": None},
                voyageNumber={"value": "118E", "evidence": None},
            )
        )

        assert paths(issues) == ["vesselName.evidence", "voyageNumber.evidence"]

    def test_checks_dates_as_well_as_strings(self) -> None:
        issues = verify_extraction_integrity(
            extraction(estimatedArrival={"value": "2026-02-24", "evidence": None})
        )

        assert paths(issues) == ["estimatedArrival.evidence"]


class TestConflicts:
    def test_rejects_a_conflicted_field_that_also_carries_a_single_value(self) -> None:
        # The model resolved a conflict itself, discarding contradictory
        # evidence. This is the check the whole contract exists for.
        issues = verify_extraction_integrity(
            extraction(
                containerNumber={"value": "TGHU1234567", "evidence": "container TGHU1234567"},
                conflicts=[
                    {
                        "field": "containerNumber",
                        "values": ["TGHU1234567", "TGHU7654321"],
                        "note": None,
                    }
                ],
            )
        )

        assert "containerNumber" in paths(issues)
        assert any("must be preserved for review, not resolved" in i.message for i in issues)

    def test_rejects_a_conflict_with_fewer_than_two_values(self) -> None:
        issues = verify_extraction_integrity(
            extraction(
                containerNumber={"value": None, "evidence": None},
                conflicts=[{"field": "containerNumber", "values": ["TGHU1234567"], "note": None}],
            )
        )

        assert paths(issues) == ["conflicts.0.values"]
        assert "at least two differing values; 1 given" in issues[0].message

    def test_rejects_an_empty_conflict(self) -> None:
        issues = verify_extraction_integrity(
            extraction(
                containerNumber={"value": None, "evidence": None},
                conflicts=[{"field": "containerNumber", "values": [], "note": None}],
            )
        )

        assert paths(issues) == ["conflicts.0.values"]

    def test_rejects_an_invented_field_name(self) -> None:
        issues = verify_extraction_integrity(
            extraction(
                conflicts=[{"field": "cargoWeight", "values": ["4800", "5200"], "note": None}]
            )
        )

        assert paths(issues) == ["conflicts.0.field"]
        assert "is not a field of the extraction" in issues[0].message

    def test_does_not_also_complain_about_the_value_of_an_invented_field(self) -> None:
        issues = verify_extraction_integrity(
            extraction(conflicts=[{"field": "nonsense", "values": ["a"], "note": None}])
        )

        # One issue, not three: the field name is the only real problem.
        assert len(issues) == 1

    def test_reports_the_index_of_each_bad_conflict(self) -> None:
        issues = verify_extraction_integrity(
            extraction(
                containerNumber={"value": None, "evidence": None},
                conflicts=[
                    {"field": "containerNumber", "values": ["a", "b"], "note": None},
                    {"field": "originPort", "values": ["Rotterdam"], "note": None},
                ],
            )
        )

        assert paths(issues) == ["conflicts.1.values", "originPort"]


class TestMissingFields:
    def test_rejects_a_field_listed_as_missing_that_carries_a_value(self) -> None:
        issues = verify_extraction_integrity(
            extraction(missingFields=[{"field": "containerNumber", "reason": "not stated"}])
        )

        assert paths(issues) == ["containerNumber"]
        assert "listed as missing, but a value was recorded" in issues[0].message

    def test_rejects_a_field_listed_as_both_missing_and_conflicting(self) -> None:
        issues = verify_extraction_integrity(
            extraction(
                containerNumber={"value": None, "evidence": None},
                missingFields=[{"field": "containerNumber", "reason": None}],
                conflicts=[{"field": "containerNumber", "values": ["a", "b"], "note": None}],
            )
        )

        assert paths(issues) == ["missingFields.0.field"]
        assert "both missing and conflicting" in issues[0].message

    def test_rejects_an_invented_missing_field_name(self) -> None:
        issues = verify_extraction_integrity(
            extraction(missingFields=[{"field": "incoterms", "reason": None}])
        )

        assert paths(issues) == ["missingFields.0.field"]

    def test_accepts_a_missing_field_with_no_reason(self) -> None:
        assert (
            verify_extraction_integrity(
                extraction(missingFields=[{"field": "shippingLine", "reason": None}])
            )
            == []
        )


class TestCoverage:
    def test_checks_every_evidenced_field_in_the_contract(self) -> None:
        # Guards against a field being added to the contract and quietly
        # escaping the evidence rule.
        assert len(EVIDENCED_FIELDS) == 12

        for field in EVIDENCED_FIELDS:
            issues = verify_extraction_integrity(
                extraction(**{field: {"value": "something", "evidence": None}})
            )
            assert f"{field}.evidence" in paths(issues)

    def test_does_not_treat_summary_or_classification_as_evidenced(self) -> None:
        assert "summary" not in EVIDENCED_FIELDS
        assert "classification" not in EVIDENCED_FIELDS

    @pytest.mark.parametrize("fixture", ["complete", "nothing-stated", "vague-date", "conflicting"])
    def test_every_shared_fixture_is_internally_consistent(self, fixture: str) -> None:
        # The fixtures are the contract's worked examples; a fixture that
        # contradicted itself would be a bad example for both languages.
        payload = ShipmentExtraction.model_validate(load_fixture(f"extraction/{fixture}.json"))

        assert verify_extraction_integrity(payload) == []
