"""The OpenAI adapter, against a stubbed client.

Ported from `openai-structured-provider.spec.ts`. Every case runs with a
key-shaped string that is not a key and a client that never opens a socket, so
no test here can make a paid call.
"""

from collections.abc import Mapping
from typing import Any, cast

import httpx2
import openai
import pytest
from pydantic import ValidationError

from ai_service.errors import AiConfigurationError, AiError
from ai_service.models.extraction import ShipmentExtraction
from ai_service.operations import AiOperation
from ai_service.providers.base import StructuredOutputRequest
from ai_service.providers.openai_provider import (
    OpenAiProviderOptions,
    OpenAiStructuredProvider,
)
from ai_service.registry import ModelRegistry
from tests.conftest import (
    TEST_API_KEY,
    TEST_MODELS,
    StubClient,
    ok_response,
    raises,
    returns,
)

OPTIONS = OpenAiProviderOptions(
    api_key=TEST_API_KEY,
    timeout_ms=30_000,
    max_output_tokens=16_000,
    max_retries=2,
    max_input_chars=100_000,
)


def build(
    behaviour: Any, overrides: Mapping[AiOperation, str] | None = None
) -> tuple[OpenAiStructuredProvider, StubClient]:
    registry = ModelRegistry.create({**TEST_MODELS, **(overrides or {})})
    client = StubClient(behaviour)
    return OpenAiStructuredProvider(OPTIONS, registry, client), client


def api_error(error_type: type[openai.APIStatusError], status: int, **body: Any) -> Exception:
    """An SDK status error, built the way the SDK builds one."""
    request = httpx2.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx2.Response(status_code=status, request=request, json={"error": body})
    return error_type(message=body.get("message", "error"), response=response, body=body)


class TestConstruction:
    def test_refuses_to_build_without_an_api_key(self) -> None:
        with pytest.raises(AiConfigurationError, match="OPENAI_API_KEY"):
            OpenAiStructuredProvider(
                OpenAiProviderOptions(
                    api_key="",
                    timeout_ms=1_000,
                    max_output_tokens=1_024,
                    max_retries=0,
                    max_input_chars=1_000,
                ),
                ModelRegistry.create(TEST_MODELS),
                StubClient(returns(ok_response())),
            )

    def test_exposes_the_routing_table_for_diagnostics(self) -> None:
        provider, _ = build(returns(ok_response()))

        assert provider.describe_routing() == TEST_MODELS


class TestOperationRouting:
    async def test_uses_the_extraction_model_for_an_extraction_request(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, client = build(returns(ok_response()))

        await provider.complete(structured_request)

        assert client.calls[0]["model"] == "test-extraction-model"

    async def test_does_not_use_any_other_operations_model(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, client = build(returns(ok_response()))

        await provider.complete(structured_request)

        model = client.calls[0]["model"]
        assert model != TEST_MODELS["classification"]
        assert model != TEST_MODELS["summarization"]
        assert model != TEST_MODELS["conflict_resolution"]

    @pytest.mark.parametrize(
        "operation", ["classification", "summarization", "conflict_resolution"]
    )
    async def test_routes_each_operation_to_its_own_model(
        self, structured_request: StructuredOutputRequest, operation: AiOperation
    ) -> None:
        # Routing is exercised for all four operations even though only
        # extraction has a caller, so the day one ships it is already correct.
        provider, client = build(returns(ok_response()))
        request = StructuredOutputRequest(
            operation=operation,
            text_format=structured_request.text_format,
            system=structured_request.system,
            user_content=structured_request.user_content,
        )

        await provider.complete(request)

        assert client.calls[0]["model"] == TEST_MODELS[operation]

    async def test_picks_up_an_override_for_extraction_only(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, client = build(returns(ok_response()), {"extraction": "overridden-model"})

        await provider.complete(structured_request)

        assert client.calls[0]["model"] == "overridden-model"

    async def test_never_substitutes_a_model_of_its_own(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        # The adapter holds no model name: everything comes from the registry.
        provider, client = build(returns(ok_response()), {"extraction": "pinned-model"})

        await provider.complete(structured_request)

        assert [call["model"] for call in client.calls] == ["pinned-model"]


class TestStructuredOutputsRequest:
    async def test_sends_a_strict_json_schema_built_from_the_contract(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        from openai.lib._parsing._responses import type_to_text_format_param

        provider, client = build(returns(ok_response()))

        await provider.complete(structured_request)

        # `responses.parse` builds the format from the Pydantic model; this
        # pins what that produces for our contract.
        text_format = client.calls[0]["text_format"]
        assert text_format is ShipmentExtraction

        schema = cast("dict[str, Any]", type_to_text_format_param(text_format))
        assert schema["type"] == "json_schema"
        assert schema["strict"] is True
        assert schema["schema"]["additionalProperties"] is False
        # Every property required is an OpenAI strict-mode requirement.
        assert len(schema["schema"]["required"]) == len(schema["schema"]["properties"])
        # OpenAI enforces enum membership during decoding.
        assert "shipment_update" in schema["schema"]["properties"]["classification"]["enum"]
        # The contract's camelCase names reach the model, so its output is the
        # shape the API persists.
        assert "estimatedDeparture" in schema["schema"]["properties"]

    async def test_sends_instructions_input_and_the_output_token_cap(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, client = build(returns(ok_response()))

        await provider.complete(structured_request)

        call = client.calls[0]
        assert call["instructions"] == structured_request.system
        assert call["input"] == structured_request.user_content
        assert call["max_output_tokens"] == 16_000

    async def test_does_not_put_the_api_key_in_the_request(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, client = build(returns(ok_response()))

        await provider.complete(structured_request)

        assert TEST_API_KEY not in str(client.calls[0])


class TestSuccessfulCompletion:
    async def test_returns_the_output_with_routing_and_usage_recorded(
        self, structured_request: StructuredOutputRequest, valid_extraction: dict[str, Any]
    ) -> None:
        provider, _ = build(returns(ok_response()))

        result = await provider.complete(structured_request)

        assert result.output == valid_extraction
        assert result.operation == "extraction"
        assert result.provider == "openai"
        # The model the provider reported, not the alias requested.
        assert result.model == "test-extraction-model-2026-01-01"
        assert result.usage.input_tokens == 1_200
        assert result.usage.output_tokens == 340
        assert result.usage.cached_input_tokens == 128
        assert result.usage.reasoning_tokens == 64
        assert result.latency_ms >= 0
        assert result.stop_reason == "completed"

    async def test_converts_a_parsed_model_to_plain_contract_data(
        self, structured_request: StructuredOutputRequest, valid_extraction: dict[str, Any]
    ) -> None:
        # The real SDK returns a `ShipmentExtraction`; the port returns plain
        # data in the contract's camelCase either way.
        parsed = ShipmentExtraction.model_validate(valid_extraction)
        provider, _ = build(returns(ok_response(parsed)))

        result = await provider.complete(structured_request)

        assert result.output == valid_extraction

    async def test_falls_back_to_the_requested_model_id_when_the_response_omits_one(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, _ = build(returns(ok_response(model=None)))

        result = await provider.complete(structured_request)

        assert result.model == "test-extraction-model"

    async def test_tolerates_a_response_without_usage_accounting(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, _ = build(returns(ok_response(usage=None)))

        result = await provider.complete(structured_request)

        assert result.usage.input_tokens is None
        assert result.usage.output_tokens is None
        assert result.usage.cached_input_tokens is None
        assert result.usage.reasoning_tokens is None

    async def test_passes_through_output_the_contract_would_reject(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        # Validation is the caller's job; the adapter does not judge content.
        off_contract = {"not": "an extraction"}
        provider, _ = build(returns(ok_response(off_contract)))

        result = await provider.complete(structured_request)

        assert result.output == off_contract


class TestFailureTranslation:
    async def test_rejects_oversized_input_instead_of_truncating_it(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        registry = ModelRegistry.create(TEST_MODELS)
        client = StubClient(returns(ok_response()))
        provider = OpenAiStructuredProvider(
            OpenAiProviderOptions(
                api_key=TEST_API_KEY,
                timeout_ms=30_000,
                max_output_tokens=16_000,
                max_retries=2,
                max_input_chars=100,
            ),
            registry,
            client,
        )
        request = StructuredOutputRequest(
            operation="extraction",
            text_format=structured_request.text_format,
            system=structured_request.system,
            user_content="x" * 5_000,
        )

        with pytest.raises(AiError) as caught:
            await provider.complete(request)

        assert caught.value.code == "input_too_large"
        assert caught.value.operation == "extraction"
        # Never truncated, and never sent.
        assert client.calls == []

    async def test_maps_a_refusal_output_item_to_the_refused_code(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        from types import SimpleNamespace

        provider, _ = build(
            returns(
                ok_response(
                    output_parsed=None,
                    output=[
                        SimpleNamespace(
                            type="refusal", refusal="I cannot help with that.", content=None
                        )
                    ],
                )
            )
        )

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "refused"
        # The model's refusal text is not echoed: it can quote the input.
        assert "cannot help" not in caught.value.message

    async def test_maps_a_nested_refusal_content_block_to_the_refused_code(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        from types import SimpleNamespace

        provider, _ = build(
            returns(
                ok_response(
                    output_parsed=None,
                    output=[
                        SimpleNamespace(
                            type="message",
                            refusal=None,
                            content=[SimpleNamespace(type="refusal", refusal="no")],
                        )
                    ],
                )
            )
        )

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "refused"

    async def test_maps_a_token_truncated_response_and_says_which_limit(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        from types import SimpleNamespace

        provider, _ = build(
            returns(
                ok_response(
                    status="incomplete",
                    incomplete_details=SimpleNamespace(reason="max_output_tokens"),
                    output_parsed=None,
                )
            )
        )

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "invalid_response"
        assert "LLM_MAX_OUTPUT_TOKENS" in caught.value.message

    async def test_maps_any_other_incomplete_reason_to_invalid_response(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        from types import SimpleNamespace

        provider, _ = build(
            returns(
                ok_response(
                    status="incomplete",
                    incomplete_details=SimpleNamespace(reason="content_filter"),
                    output_parsed=None,
                )
            )
        )

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "invalid_response"

    @pytest.mark.parametrize("status", ["failed", "cancelled"])
    async def test_maps_a_failed_response_status_to_invalid_response(
        self, structured_request: StructuredOutputRequest, status: str
    ) -> None:
        from types import SimpleNamespace

        provider, _ = build(
            returns(
                ok_response(
                    status=status,
                    error=SimpleNamespace(code="server_error", message="boom"),
                    output_parsed=None,
                )
            )
        )

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "invalid_response"
        # The provider's code is safe to surface; its message is not.
        assert "server_error" in caught.value.message
        assert "boom" not in caught.value.message

    async def test_maps_missing_parsed_output_to_invalid_response(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, _ = build(returns(ok_response(output_parsed=None)))

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "invalid_response"

    async def test_maps_a_request_timeout_to_the_timeout_code(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        request = httpx2.Request("POST", "https://api.openai.com/v1/responses")
        provider, _ = build(raises(openai.APITimeoutError(request=request)))

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "timeout"
        assert "30000ms" in caught.value.message

    async def test_maps_a_connection_failure_to_unavailable(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        request = httpx2.Request("POST", "https://api.openai.com/v1/responses")
        provider, _ = build(
            raises(openai.APIConnectionError(message="socket hang up", request=request))
        )

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "unavailable"

    @pytest.mark.parametrize(
        ("error_type", "status"),
        [(openai.AuthenticationError, 401), (openai.PermissionDeniedError, 403)],
    )
    async def test_maps_a_rejected_credential_to_a_configuration_error(
        self,
        structured_request: StructuredOutputRequest,
        error_type: type[openai.APIStatusError],
        status: int,
    ) -> None:
        provider, _ = build(raises(api_error(error_type, status, message="bad key")))

        with pytest.raises(AiConfigurationError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "configuration"

    async def test_maps_rate_limiting_to_the_rate_limited_code(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, _ = build(raises(api_error(openai.RateLimitError, 429, message="slow down")))

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "rate_limited"

    async def test_reports_an_unknown_model_as_a_configuration_error_naming_the_operation(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, _ = build(raises(api_error(openai.NotFoundError, 404, message="no such model")))

        with pytest.raises(AiConfigurationError) as caught:
            await provider.complete(structured_request)

        assert "test-extraction-model" in caught.value.message
        assert "extraction" in caught.value.message

    async def test_reports_a_model_that_cannot_do_structured_outputs_without_switching_models(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, _ = build(
            raises(
                api_error(
                    openai.BadRequestError,
                    400,
                    message="response_format is not supported",
                    code="unsupported_parameter",
                )
            )
        )

        with pytest.raises(AiConfigurationError) as caught:
            await provider.complete(structured_request)

        assert "test-extraction-model" in caught.value.message
        assert "Structured Outputs" in caught.value.message
        # No fallback: nothing else was tried.
        assert "fallback" in caught.value.message

    async def test_maps_any_other_api_status_to_unavailable(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, _ = build(raises(api_error(openai.InternalServerError, 503, message="down")))

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "unavailable"
        assert "503" in caught.value.message

    async def test_maps_output_the_sdk_could_not_parse_to_invalid_output_with_issues(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        # `responses.parse` validates against the contract and raises when the
        # model's JSON does not satisfy it.
        try:
            ShipmentExtraction.model_validate({"classification": "nope"})
        except ValidationError as error:
            parse_failure: ValidationError = error

        provider, _ = build(raises(parse_failure))

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.code == "invalid_output"
        assert caught.value.issues
        assert all(issue.path for issue in caught.value.issues)

    async def test_leaves_an_unmapped_error_alone(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        # Not translated into an AI failure: an unknown bug must not be
        # recorded as a verdict on the email.
        provider, _ = build(raises(RuntimeError("something unmapped")))

        with pytest.raises(RuntimeError, match="something unmapped"):
            await provider.complete(structured_request)


class TestFailureContext:
    async def test_records_which_model_and_operation_failed(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        provider, _ = build(raises(api_error(openai.RateLimitError, 429, message="slow")))

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.operation == "extraction"
        assert caught.value.model == "test-extraction-model"
        assert caught.value.latency_ms is not None
        assert caught.value.latency_ms >= 0

    async def test_records_latency_even_on_a_rejected_credential(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        # The request still consumed wall-clock time; cost monitoring wants it.
        provider, _ = build(raises(api_error(openai.AuthenticationError, 401, message="bad key")))

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert caught.value.latency_ms is not None

    async def test_never_puts_provider_detail_or_the_prompt_in_the_message(
        self, structured_request: StructuredOutputRequest
    ) -> None:
        secretish = "sk-leaked-value and the email body text"
        provider, _ = build(raises(api_error(openai.RateLimitError, 429, message=secretish)))

        with pytest.raises(AiError) as caught:
            await provider.complete(structured_request)

        assert "sk-leaked-value" not in caught.value.message
        assert "email body text" not in caught.value.message
        assert structured_request.user_content not in caught.value.message
