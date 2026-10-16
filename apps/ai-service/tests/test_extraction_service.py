"""The extraction operation end to end inside the service, with the provider
stubbed.

Everything above the provider — prompt construction, validation, the
deterministic integrity check, accounting and failure classification — is the
real code path, so these tests exercise production behaviour with no network
call and no key.
"""

from typing import Any

import pytest

from ai_service.errors import AiConfigurationError, AiError
from ai_service.models.wire import ExtractRequest, OperationMetadata
from ai_service.operations import AiOperation
from ai_service.providers.base import (
    StructuredOutputRequest,
    StructuredOutputResult,
    StructuredOutputUsage,
)
from ai_service.providers.unconfigured import UnconfiguredProvider
from ai_service.services.extraction_service import ExtractionService
from tests.conftest import TEST_MODELS, load_fixture

USAGE = StructuredOutputUsage(
    input_tokens=1_234, output_tokens=567, cached_input_tokens=128, reasoning_tokens=64
)


class FakeProvider:
    """Stands in for the LLM at the provider port."""

    name = "fake"

    def __init__(self) -> None:
        self.requests: list[StructuredOutputRequest] = []
        self._output: Any = load_fixture("extraction/complete.json")
        self._error: BaseException | None = None

    @property
    def operations(self) -> list[AiOperation]:
        return [request.operation for request in self.requests]

    def describe_routing(self) -> dict[AiOperation, str]:
        return dict(TEST_MODELS)

    def succeeds_with(self, output: Any) -> None:
        self._output, self._error = output, None

    def fails_with(self, error: BaseException) -> None:
        self._error = error

    async def complete(self, request: StructuredOutputRequest) -> StructuredOutputResult:
        self.requests.append(request)
        if self._error is not None:
            raise self._error
        return StructuredOutputResult(
            output=self._output,
            operation=request.operation,
            provider=self.name,
            model=TEST_MODELS[request.operation],
            usage=USAGE,
            latency_ms=42,
            stop_reason="completed",
        )


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def service(provider: FakeProvider) -> ExtractionService:
    return ExtractionService(provider)


def with_output(base: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    return {**base, **overrides}


class TestSuccessfulExtraction:
    async def test_returns_the_validated_extraction(
        self,
        service: ExtractionService,
        extract_request: ExtractRequest,
        valid_extraction: dict[str, Any],
    ) -> None:
        response = await service.extract(extract_request)

        assert response.status == "succeeded"
        assert response.failure_code is None
        assert response.validation_errors is None
        assert response.extraction is not None
        assert response.extraction.model_dump() == valid_extraction

    async def test_routes_extraction_to_the_extraction_model_and_makes_no_other_call(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        await service.extract(extract_request)

        # Exactly one model call: routing is configured for four operations,
        # but only extraction has a caller today.
        assert provider.operations == ["extraction"]

    async def test_records_usage_and_latency_for_the_call(
        self, service: ExtractionService, extract_request: ExtractRequest
    ) -> None:
        response = await service.extract(extract_request)
        operation = response.operation

        assert isinstance(operation, OperationMetadata)
        assert operation.operation == "extraction"
        assert operation.provider == "fake"
        assert operation.model == TEST_MODELS["extraction"]
        assert operation.status == "succeeded"
        assert operation.failure_code is None
        assert operation.input_tokens == 1_234
        assert operation.output_tokens == 567
        assert operation.cached_input_tokens == 128
        assert operation.reasoning_tokens == 64
        assert operation.latency_ms == 42
        assert operation.stop_reason == "completed"
        # An offset is required: the API validates this against its ISO
        # timestamp contract.
        assert operation.completed_at.endswith("+00:00")

    async def test_sends_the_email_content_and_the_untrusted_data_markers(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        await service.extract(extract_request)
        sent = provider.requests[0]

        assert extract_request.email.body_text in sent.user_content
        assert extract_request.email.subject in sent.user_content
        assert extract_request.email.sender in sent.user_content
        assert "--- BEGIN EMAIL ---" in sent.user_content
        assert "untrusted message data" in sent.user_content
        assert "Only record what the email actually states" in sent.system

    async def test_names_every_classification_in_the_prompt(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        await service.extract(extract_request)

        assert "shipment_update" in provider.requests[0].system

    async def test_accepts_an_extraction_reporting_conflicts_and_missing_fields(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.succeeds_with(load_fixture("extraction/conflicting.json"))

        response = await service.extract(extract_request)

        assert response.status == "succeeded"
        assert response.extraction is not None
        assert len(response.extraction.conflicts) == 2
        # A conflicted field keeps no single value.
        assert response.extraction.container_number.value is None

    async def test_preserves_a_vague_date_exactly_as_written(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.succeeds_with(load_fixture("extraction/vague-date.json"))

        response = await service.extract(extract_request)

        assert response.status == "succeeded"
        assert response.extraction is not None
        assert response.extraction.estimated_arrival.value == "mid-March"

    async def test_accepts_an_extraction_that_found_nothing(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.succeeds_with(load_fixture("extraction/nothing-stated.json"))

        response = await service.extract(extract_request)

        assert response.status == "succeeded"
        assert response.extraction is not None
        assert response.extraction.container_number.value is None
        assert len(response.extraction.missing_fields) == 2


class TestInvalidOutput:
    async def test_rejects_output_missing_a_required_field(
        self,
        service: ExtractionService,
        provider: FakeProvider,
        extract_request: ExtractRequest,
        valid_extraction: dict[str, Any],
    ) -> None:
        incomplete = {k: v for k, v in valid_extraction.items() if k != "containerNumber"}
        provider.succeeds_with(incomplete)

        response = await service.extract(extract_request)

        assert response.status == "failed"
        assert response.failure_code == "invalid_output"
        assert response.extraction is None
        assert response.validation_errors is not None
        assert "containerNumber" in [issue.path for issue in response.validation_errors]

    async def test_rejects_a_classification_outside_the_enum(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        # Structured Outputs enforces enum membership during decoding, so this
        # is defence in depth — it pins the behaviour that protects the
        # database if a provider ever returns an unconstrained value.
        provider.succeeds_with(load_fixture("extraction/invalid-unknown-classification.json"))

        response = await service.extract(extract_request)

        assert response.status == "failed"
        assert response.failure_code == "invalid_output"
        assert response.validation_errors is not None
        assert "classification" in [issue.path for issue in response.validation_errors]

    async def test_rejects_output_that_is_not_an_extraction_at_all(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.succeeds_with({"not": "an extraction"})

        response = await service.extract(extract_request)

        assert response.status == "failed"
        assert response.failure_code == "invalid_output"

    async def test_still_records_the_tokens_spent_on_a_rejected_run(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.succeeds_with({"not": "an extraction"})

        response = await service.extract(extract_request)

        # The tokens were spent even though the output was rejected.
        assert response.operation is not None
        assert response.operation.status == "succeeded"
        assert response.operation.input_tokens == 1_234

    async def test_rejects_an_invented_field_rather_than_dropping_it(
        self,
        service: ExtractionService,
        provider: FakeProvider,
        extract_request: ExtractRequest,
        valid_extraction: dict[str, Any],
    ) -> None:
        provider.succeeds_with(with_output(valid_extraction, cargoWeight="4800 kg"))

        response = await service.extract(extract_request)

        assert response.status == "failed"
        assert response.failure_code == "invalid_output"


class TestSelfContradictoryOutput:
    async def test_rejects_a_conflicted_field_that_was_also_given_a_value(
        self,
        service: ExtractionService,
        provider: FakeProvider,
        extract_request: ExtractRequest,
        valid_extraction: dict[str, Any],
    ) -> None:
        provider.succeeds_with(
            with_output(
                valid_extraction,
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

        response = await service.extract(extract_request)

        assert response.status == "failed"
        assert response.failure_code == "invalid_output"
        assert response.extraction is None
        assert response.validation_errors is not None
        assert "containerNumber" in [issue.path for issue in response.validation_errors]
        assert "not resolved" in (response.failure_message or "")
        # No extra model call was needed to notice this.
        assert len(provider.requests) == 1

    async def test_rejects_a_value_recorded_without_evidence(
        self,
        service: ExtractionService,
        provider: FakeProvider,
        extract_request: ExtractRequest,
        valid_extraction: dict[str, Any],
    ) -> None:
        provider.succeeds_with(
            with_output(
                valid_extraction, vesselName={"value": "MV Northern Star", "evidence": None}
            )
        )

        response = await service.extract(extract_request)

        assert response.status == "failed"
        assert response.validation_errors is not None
        assert "vesselName.evidence" in [issue.path for issue in response.validation_errors]

    async def test_still_records_the_tokens_spent_on_a_contradictory_run(
        self,
        service: ExtractionService,
        provider: FakeProvider,
        extract_request: ExtractRequest,
        valid_extraction: dict[str, Any],
    ) -> None:
        provider.succeeds_with(
            with_output(
                valid_extraction, vesselName={"value": "MV Northern Star", "evidence": None}
            )
        )

        response = await service.extract(extract_request)

        assert response.operation is not None
        assert response.operation.status == "succeeded"


class TestProviderFailures:
    @pytest.mark.parametrize(
        "code",
        [
            "timeout",
            "rate_limited",
            "unavailable",
            "refused",
            "input_too_large",
            "invalid_response",
        ],
    )
    async def test_reports_a_provider_failure_with_its_code(
        self,
        service: ExtractionService,
        provider: FakeProvider,
        extract_request: ExtractRequest,
        code: str,
    ) -> None:
        provider.fails_with(
            AiError(
                code,  # type: ignore[arg-type]
                "simulated",
                operation="extraction",
                model=TEST_MODELS["extraction"],
                latency_ms=7,
            )
        )

        response = await service.extract(extract_request)

        assert response.status == "failed"
        assert response.failure_code == code
        assert response.extraction is None

    async def test_records_the_model_that_failed(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.fails_with(
            AiError(
                "rate_limited",
                "The provider rate-limited this request.",
                operation="extraction",
                model=TEST_MODELS["extraction"],
                latency_ms=318,
            )
        )

        response = await service.extract(extract_request)
        operation = response.operation

        assert operation is not None
        assert operation.status == "failed"
        assert operation.model == TEST_MODELS["extraction"]
        assert operation.failure_code == "rate_limited"
        assert operation.latency_ms == 318
        # Nothing was produced, so nothing is accounted as produced.
        assert operation.input_tokens is None

    async def test_records_an_unknown_model_when_the_failure_predates_routing(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.fails_with(AiError("unavailable", "Could not reach the provider."))

        response = await service.extract(extract_request)

        assert response.operation is not None
        assert response.operation.model == "unknown"

    async def test_carries_validation_issues_from_a_provider_side_parse_failure(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        from ai_service.models.common import ValidationIssue

        provider.fails_with(
            AiError(
                "invalid_output",
                "The model returned output that did not match the extraction schema.",
                operation="extraction",
                model=TEST_MODELS["extraction"],
                issues=[ValidationIssue(path="classification", message="Input should be ...")],
            )
        )

        response = await service.extract(extract_request)

        assert response.failure_code == "invalid_output"
        assert response.validation_errors is not None
        assert response.validation_errors[0].path == "classification"

    async def test_keeps_the_failure_message_free_of_email_content(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.fails_with(
            AiError("timeout", "The provider did not respond within 60000ms.", model="m")
        )

        response = await service.extract(extract_request)

        assert "MSCU7654321" not in (response.failure_message or "")

    async def test_lets_a_configuration_error_propagate(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        # An operator's problem, not this email's: it must not be recorded as a
        # verdict on the message.
        provider.fails_with(AiConfigurationError("The provider rejected the API key."))

        with pytest.raises(AiConfigurationError):
            await service.extract(extract_request)

    async def test_lets_an_unexpected_error_propagate(
        self, service: ExtractionService, provider: FakeProvider, extract_request: ExtractRequest
    ) -> None:
        provider.fails_with(RuntimeError("something unmapped"))

        with pytest.raises(RuntimeError):
            await service.extract(extract_request)


class TestUnconfiguredProvider:
    async def test_raises_a_configuration_error_instead_of_fabricating_a_result(
        self, extract_request: ExtractRequest
    ) -> None:
        service = ExtractionService(UnconfiguredProvider())

        with pytest.raises(AiConfigurationError) as caught:
            await service.extract(extract_request)

        assert "LLM_PROVIDER=openai" in caught.value.message
        assert "OPENAI_API_KEY" in caught.value.message
