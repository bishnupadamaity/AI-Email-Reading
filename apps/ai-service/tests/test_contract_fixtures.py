"""Cross-language contract tests.

Every fixture under `test/fixtures/` is read by this suite **and** by the
TypeScript suite (`packages/contracts/src/ai-service.spec.ts` and
`extraction.spec.ts`). A field renamed, re-cased, made non-nullable or dropped
on either side fails the other side here, which is what keeps the Pydantic
models and the Zod schemas from drifting apart silently.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from ai_service.models.extraction import ShipmentExtraction
from ai_service.models.wire import ExtractRequest, ExtractResponse
from tests.conftest import FIXTURES, load_fixture


def fixture_names(directory: str, *, invalid: bool) -> list[str]:
    folder = FIXTURES / directory
    return sorted(
        path.name for path in folder.glob("*.json") if path.name.startswith("invalid-") is invalid
    )


class TestFixturesExist:
    def test_the_fixture_directory_is_where_both_suites_look(self) -> None:
        assert FIXTURES.is_dir(), f"shared fixtures missing at {FIXTURES}"
        assert (FIXTURES / "README.md").is_file()

    def test_there_are_valid_and_invalid_extraction_fixtures(self) -> None:
        assert fixture_names("extraction", invalid=False)
        assert fixture_names("extraction", invalid=True)


class TestExtractionContract:
    @pytest.mark.parametrize("name", fixture_names("extraction", invalid=False))
    def test_accepts_every_valid_fixture(self, name: str) -> None:
        ShipmentExtraction.model_validate(load_fixture(f"extraction/{name}"))

    @pytest.mark.parametrize("name", fixture_names("extraction", invalid=True))
    def test_rejects_every_invalid_fixture(self, name: str) -> None:
        with pytest.raises(ValidationError):
            ShipmentExtraction.model_validate(load_fixture(f"extraction/{name}"))

    @pytest.mark.parametrize("name", fixture_names("extraction", invalid=False))
    def test_round_trips_each_fixture_byte_for_byte(self, name: str) -> None:
        # The serialised form must equal what was validated: this is what
        # proves the camelCase aliases are symmetrical, and that the API will
        # store exactly the contract it expects.
        original: dict[str, Any] = load_fixture(f"extraction/{name}")

        assert ShipmentExtraction.model_validate(original).model_dump() == original

    def test_the_date_representation_is_a_plain_string(self) -> None:
        # Preserved from the TypeScript contract on purpose: real emails say
        # "mid-March", and a strict date type would discard that.
        vague = ShipmentExtraction.model_validate(load_fixture("extraction/vague-date.json"))

        assert vague.estimated_arrival.value == "mid-March"
        assert isinstance(vague.estimated_departure.value, str)

    def test_a_conflicted_field_carries_no_single_value(self) -> None:
        conflicting = ShipmentExtraction.model_validate(load_fixture("extraction/conflicting.json"))

        for conflict in conflicting.conflicts:
            assert len(conflict.values) >= 2
        assert conflicting.container_number.value is None


class TestAiServiceContract:
    def test_accepts_the_request_fixture(self) -> None:
        request = ExtractRequest.model_validate(load_fixture("ai-service/extract-request.json"))

        assert request.operation == "extraction"
        assert request.email.body_text

    @pytest.mark.parametrize("name", fixture_names("ai-service", invalid=False))
    def test_round_trips_every_fixture(self, name: str) -> None:
        original: dict[str, Any] = load_fixture(f"ai-service/{name}")
        model: type[ExtractRequest] | type[ExtractResponse] = (
            ExtractRequest if "request" in name else ExtractResponse
        )

        assert model.model_validate(original).model_dump() == original

    def test_the_success_response_carries_an_extraction_and_accounting(self) -> None:
        response = ExtractResponse.model_validate(
            load_fixture("ai-service/extract-response-succeeded.json")
        )

        assert response.status == "succeeded"
        assert response.extraction is not None
        assert response.operation is not None
        assert response.operation.status == "succeeded"
        assert response.validation_errors is None

    def test_the_invalid_output_response_carries_issues_and_no_extraction(self) -> None:
        response = ExtractResponse.model_validate(
            load_fixture("ai-service/extract-response-invalid-output.json")
        )

        assert response.status == "failed"
        assert response.failure_code == "invalid_output"
        assert response.extraction is None
        assert response.validation_errors is not None
        assert response.validation_errors[0].path == "containerNumber"

    def test_the_provider_failure_response_accounts_for_the_failed_call(self) -> None:
        response = ExtractResponse.model_validate(
            load_fixture("ai-service/extract-response-provider-failed.json")
        )

        assert response.failure_code == "rate_limited"
        assert response.operation is not None
        assert response.operation.status == "failed"
        assert response.operation.input_tokens is None

    def test_no_fixture_contains_anything_resembling_a_credential(self) -> None:
        # Credentials live in this service's configuration; they never cross
        # this contract in either direction.
        for path in sorted(FIXTURES.rglob("*.json")):
            text = path.read_text()
            assert "sk-" not in text, path
            assert "Authorization" not in text, path


class TestFailureCodeVocabulary:
    def test_every_code_this_service_can_return_is_known_to_the_api(self) -> None:
        # The API persists `failureCode` straight into
        # `analysisFailureCodeSchema`; a code it does not know would break the
        # analysis contract.
        from typing import get_args

        from ai_service.errors import FailureCode

        api_contract = (
            Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "analyses.ts"
        )
        declared = api_contract.read_text()

        for code in get_args(FailureCode):
            assert f"'{code}'" in declared, f"{code} is not in analysisFailureCodeSchema"

    def test_the_operations_match_the_shared_routing_vocabulary(self) -> None:
        operations_ts = (
            Path(__file__).resolve().parents[3]
            / "packages"
            / "contracts"
            / "src"
            / "ai-operations.ts"
        )
        declared = operations_ts.read_text()

        from ai_service.operations import AI_OPERATIONS

        for operation in AI_OPERATIONS:
            assert f"'{operation}'" in declared, f"{operation} is not in AI_OPERATIONS"


class TestFixtureHygiene:
    @pytest.mark.parametrize(
        "path", sorted(str(p.relative_to(FIXTURES)) for p in FIXTURES.rglob("*.json"))
    )
    def test_every_fixture_is_valid_json_and_read_by_this_suite(self, path: str) -> None:
        json.loads((FIXTURES / path).read_text())
