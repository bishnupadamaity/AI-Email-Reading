"""The HTTP surface: health probes, authentication and the extract endpoint.

Uses FastAPI's test client against a real app instance whose provider is
replaced, so routing, request validation, the auth guard and the error-body
normalisation are all the production code paths.
"""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from ai_service.api.deps import get_provider
from ai_service.config import Settings
from ai_service.errors import AiConfigurationError, AiError
from ai_service.main import create_app
from ai_service.operations import AiOperation
from ai_service.providers.base import (
    StructuredOutputRequest,
    StructuredOutputResult,
    StructuredOutputUsage,
)
from tests.conftest import TEST_MODELS, load_fixture

SettingsFactory = Callable[..., Settings]
TOKEN = "internal-shared-token"


class ScriptedProvider:
    """Returns or raises whatever the test scripted."""

    name = "openai"

    def __init__(self, output: Any = None, error: BaseException | None = None) -> None:
        self._output = output if output is not None else load_fixture("extraction/complete.json")
        self._error = error
        self.calls: list[StructuredOutputRequest] = []

    def describe_routing(self) -> dict[AiOperation, str]:
        return dict(TEST_MODELS)

    async def complete(self, request: StructuredOutputRequest) -> StructuredOutputResult:
        self.calls.append(request)
        if self._error is not None:
            raise self._error
        return StructuredOutputResult(
            output=self._output,
            operation=request.operation,
            provider=self.name,
            model=TEST_MODELS[request.operation],
            usage=StructuredOutputUsage(1_234, 567, 128, 64),
            latency_ms=42,
            stop_reason="completed",
        )


def client_for(
    settings: Settings,
    provider: ScriptedProvider | None = None,
    *,
    propagate_server_errors: bool = True,
) -> tuple[TestClient, ScriptedProvider]:
    """An app whose provider is the scripted one. No key, no network.

    `propagate_server_errors=False` makes the client behave like a deployed
    server, returning the 500 the exception handler produces instead of
    re-raising into the test.
    """
    app = create_app(settings)
    scripted = provider or ScriptedProvider()
    app.dependency_overrides[get_provider] = lambda: scripted
    return TestClient(app, raise_server_exceptions=propagate_server_errors), scripted


@pytest.fixture
def configured(settings_factory: SettingsFactory) -> Settings:
    return settings_factory(llm_provider="openai", openai_api_key="sk-test-not-a-real-key")


class TestHealth:
    def test_liveness_succeeds_without_credentials(self, settings_factory: SettingsFactory) -> None:
        client, _ = client_for(settings_factory())

        response = client.get("/health")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["service"] == "email-ai-ai-service"
        assert body["uptimeSeconds"] >= 0
        assert isinstance(body["timestamp"], str)

    def test_liveness_needs_no_token_even_when_one_is_configured(
        self, settings_factory: SettingsFactory
    ) -> None:
        # Probes should not have to hold a credential.
        client, _ = client_for(settings_factory(ai_service_token=TOKEN))

        assert client.get("/health").status_code == 200
        assert client.get("/health/ready").status_code == 200

    def test_readiness_reports_the_provider_as_disabled_when_unconfigured(
        self, settings_factory: SettingsFactory
    ) -> None:
        client, _ = client_for(settings_factory())

        body = client.get("/health/ready").json()

        assert body["dependencies"] == {"provider": "disabled", "tracing": "disabled"}

    def test_readiness_reports_the_provider_as_up_when_configured(
        self, configured: Settings
    ) -> None:
        client, _ = client_for(configured)

        body = client.get("/health/ready").json()

        assert body["dependencies"] == {"provider": "up", "tracing": "disabled"}

    def test_readiness_reports_tracing_as_up_only_once_a_key_is_set(
        self, settings_factory: SettingsFactory
    ) -> None:
        client, _ = client_for(settings_factory(langsmith_tracing=True))
        assert client.get("/health/ready").json()["dependencies"]["tracing"] == "disabled"

        client, _ = client_for(
            settings_factory(langsmith_tracing=True, langsmith_api_key="ls-test-not-a-real-key")
        )
        assert client.get("/health/ready").json()["dependencies"]["tracing"] == "up"

    def test_readiness_reports_the_routing_table_and_what_is_implemented(
        self, configured: Settings
    ) -> None:
        client, _ = client_for(configured)

        body = client.get("/health/ready").json()

        assert body["models"] == TEST_MODELS
        # Documents the gap between configured and implemented, at runtime.
        assert body["implementedOperations"] == ["extraction"]

    def test_readiness_never_leaks_the_key(self, configured: Settings) -> None:
        client, _ = client_for(configured)

        assert "sk-test-not-a-real-key" not in client.get("/health/ready").text


class TestAuthentication:
    def test_rejects_a_request_with_no_token_when_one_is_configured(
        self, settings_factory: SettingsFactory
    ) -> None:
        settings = settings_factory(
            llm_provider="openai", openai_api_key="sk-x", ai_service_token=TOKEN
        )
        client, provider = client_for(settings)

        response = client.post(
            "/internal/v1/ai/extract", json=load_fixture("ai-service/extract-request.json")
        )

        assert response.status_code == 401
        assert response.json()["statusCode"] == 401
        # Nothing was spent on an unauthenticated request.
        assert provider.calls == []

    @pytest.mark.parametrize(
        "header", ["", "Bearer wrong-token", "wrong-token", "Basic aaa", "Bearer "]
    )
    def test_rejects_a_wrong_or_malformed_authorization_header(
        self, settings_factory: SettingsFactory, header: str
    ) -> None:
        settings = settings_factory(
            llm_provider="openai", openai_api_key="sk-x", ai_service_token=TOKEN
        )
        client, provider = client_for(settings)

        response = client.post(
            "/internal/v1/ai/extract",
            json=load_fixture("ai-service/extract-request.json"),
            headers={"Authorization": header},
        )

        assert response.status_code == 401
        assert provider.calls == []

    def test_accepts_the_configured_token(self, settings_factory: SettingsFactory) -> None:
        settings = settings_factory(
            llm_provider="openai", openai_api_key="sk-x", ai_service_token=TOKEN
        )
        client, _ = client_for(settings)

        response = client.post(
            "/internal/v1/ai/extract",
            json=load_fixture("ai-service/extract-request.json"),
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

        assert response.status_code == 200

    def test_allows_an_unauthenticated_call_on_loopback_with_no_token_configured(
        self, configured: Settings
    ) -> None:
        # Local development: `Settings` refuses to start on a reachable
        # address without a token, so this is loopback-only by construction.
        client, _ = client_for(configured)

        response = client.post(
            "/internal/v1/ai/extract", json=load_fixture("ai-service/extract-request.json")
        )

        assert response.status_code == 200

    def test_never_echoes_the_presented_token(self, settings_factory: SettingsFactory) -> None:
        settings = settings_factory(
            llm_provider="openai", openai_api_key="sk-x", ai_service_token=TOKEN
        )
        client, _ = client_for(settings)

        response = client.post(
            "/internal/v1/ai/extract",
            json=load_fixture("ai-service/extract-request.json"),
            headers={"Authorization": "Bearer guessed-value"},
        )

        assert "guessed-value" not in response.text
        assert TOKEN not in response.text


class TestExtractEndpoint:
    def test_returns_the_contract_response_for_a_successful_extraction(
        self, configured: Settings
    ) -> None:
        client, _ = client_for(configured)

        response = client.post(
            "/internal/v1/ai/extract", json=load_fixture("ai-service/extract-request.json")
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "succeeded"
        assert body["extraction"] == load_fixture("extraction/complete.json")
        assert body["validationErrors"] is None
        assert body["failureCode"] is None
        assert body["operation"]["model"] == TEST_MODELS["extraction"]
        assert body["operation"]["inputTokens"] == 1_234

    def test_answers_200_with_a_failed_status_for_a_recorded_failure(
        self, configured: Settings
    ) -> None:
        # A failed extraction is an outcome, not a transport error: the API
        # must be able to persist it.
        provider = ScriptedProvider(
            error=AiError(
                "rate_limited",
                "The provider rate-limited this request.",
                operation="extraction",
                model=TEST_MODELS["extraction"],
                latency_ms=318,
            )
        )
        client, _ = client_for(configured, provider)

        response = client.post(
            "/internal/v1/ai/extract", json=load_fixture("ai-service/extract-request.json")
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "failed"
        assert body["failureCode"] == "rate_limited"
        assert body["extraction"] is None
        assert body["operation"]["status"] == "failed"

    def test_answers_503_when_the_service_itself_is_misconfigured(
        self, configured: Settings
    ) -> None:
        provider = ScriptedProvider(
            error=AiConfigurationError("The provider rejected the API key.")
        )
        client, _ = client_for(configured, provider)

        response = client.post(
            "/internal/v1/ai/extract", json=load_fixture("ai-service/extract-request.json")
        )

        assert response.status_code == 503
        body = response.json()
        assert body["statusCode"] == 503
        assert body["failureCode"] == "configuration"
        assert "API key" in body["message"]

    def test_answers_503_when_no_provider_is_configured_at_all(
        self, settings_factory: SettingsFactory
    ) -> None:
        # The real factory runs: no override, no credentials.
        app = create_app(settings_factory())
        client = TestClient(app)

        response = client.post(
            "/internal/v1/ai/extract", json=load_fixture("ai-service/extract-request.json")
        )

        assert response.status_code == 503
        assert "LLM_PROVIDER=openai" in response.json()["message"]
        assert "OPENAI_API_KEY" in response.json()["message"]


class TestRequestValidation:
    def test_rejects_a_body_with_no_email(self, configured: Settings) -> None:
        client, provider = client_for(configured)

        response = client.post("/internal/v1/ai/extract", json={"operation": "extraction"})

        assert response.status_code == 422
        assert "email" in response.json()["message"]
        assert provider.calls == []

    def test_rejects_an_operation_with_no_implementation(self, configured: Settings) -> None:
        # Routing is configured for four operations; only extraction has a
        # caller. Asking for another one fails loudly instead of running
        # extraction under a different name.
        client, provider = client_for(configured)
        body = load_fixture("ai-service/extract-request.json")
        body["operation"] = "summarization"

        response = client.post("/internal/v1/ai/extract", json=body)

        assert response.status_code == 422
        assert "operation" in response.json()["message"]
        assert provider.calls == []

    def test_rejects_an_unknown_field_rather_than_ignoring_it(self, configured: Settings) -> None:
        client, _ = client_for(configured)
        body = load_fixture("ai-service/extract-request.json")
        body["email"]["attachments"] = ["invoice.pdf"]

        response = client.post("/internal/v1/ai/extract", json=body)

        assert response.status_code == 422

    def test_never_echoes_the_rejected_email_content(self, configured: Settings) -> None:
        # FastAPI's default handler repeats the offending input; this service
        # reports only which fields were wrong, because the input is message
        # content.
        client, _ = client_for(configured)
        body = load_fixture("ai-service/extract-request.json")
        body["email"]["receivedAt"] = 12345

        response = client.post("/internal/v1/ai/extract", json=body)

        assert response.status_code == 422
        assert "MSCU7654321" not in response.text
        assert "receivedAt" in response.json()["message"]

    def test_accepts_an_email_with_no_id(self, configured: Settings) -> None:
        client, _ = client_for(configured)
        body = load_fixture("ai-service/extract-request.json")
        del body["email"]["id"]

        assert client.post("/internal/v1/ai/extract", json=body).status_code == 200


class TestUnexpectedErrors:
    def test_reports_nothing_about_an_unmapped_failure(self, configured: Settings) -> None:
        provider = ScriptedProvider(error=RuntimeError("secret internal detail"))
        client, _ = client_for(configured, provider, propagate_server_errors=False)

        response = client.post(
            "/internal/v1/ai/extract",
            json=load_fixture("ai-service/extract-request.json"),
        )

        assert response.status_code == 500
        assert "secret internal detail" not in response.text
        assert response.json()["message"] == "An unexpected error occurred."
