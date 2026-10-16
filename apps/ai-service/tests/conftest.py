"""Shared test scaffolding.

No test in this suite needs an API key, and none makes a network call: the
OpenAI client is replaced at the one seam the provider exposes for it, and the
assertions below check that nothing resembling a credential ever reaches a
request or a message.
"""

import json
from collections.abc import Callable, Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from ai_service.config import Settings, reset_settings_cache
from ai_service.models.extraction import ShipmentExtraction
from ai_service.models.wire import EmailPayload, ExtractRequest
from ai_service.operations import AiOperation
from ai_service.providers.base import StructuredOutputRequest

#: A key-shaped string that is not a key. Tests assert it never leaks.
TEST_API_KEY = "sk-test-not-a-real-key"

#: Routing table the tests pin, one distinct model per operation.
TEST_MODELS: dict[AiOperation, str] = {
    "classification": "test-classification-model",
    "extraction": "test-extraction-model",
    "summarization": "test-summarization-model",
    "conflict_resolution": "test-conflict-model",
}

FIXTURES = Path(__file__).resolve().parents[3] / "test" / "fixtures"


def load_fixture(relative: str) -> Any:
    """Read one of the cross-language contract fixtures."""
    return json.loads((FIXTURES / relative).read_text())


@pytest.fixture(autouse=True)
def _isolate_settings() -> Iterator[None]:
    """Keep a memoised `Settings` from leaking between tests."""
    reset_settings_cache()
    yield
    reset_settings_cache()


@pytest.fixture
def settings_factory() -> Callable[..., Settings]:
    """Build settings from explicit values, ignoring any `.env` on disk.

    Reading the developer's real `.env` would make these tests depend on
    whatever happens to be configured locally.
    """

    def build(**overrides: Any) -> Settings:
        # `_env_file` is pydantic-settings' documented per-instance override;
        # it is not in the generated `__init__` signature mypy sees.
        return Settings(_env_file=None, **overrides)  # type: ignore[call-arg]

    return build


@pytest.fixture
def valid_extraction() -> dict[str, Any]:
    """A schema-valid, internally consistent extraction, from the shared
    fixtures the TypeScript suite also reads."""
    extraction: dict[str, Any] = load_fixture("extraction/complete.json")
    return extraction


@pytest.fixture
def extract_request() -> ExtractRequest:
    return ExtractRequest.model_validate(load_fixture("ai-service/extract-request.json"))


@pytest.fixture
def structured_request() -> StructuredOutputRequest:
    return StructuredOutputRequest(
        operation="extraction",
        text_format=ShipmentExtraction,
        system="You extract shipment details.",
        user_content="Container MSCU7654321 departs Rotterdam.",
    )


@pytest.fixture
def email_payload() -> EmailPayload:
    return EmailPayload(
        id="28c76809-9dbf-481e-8237-e02c0bfba0e8",
        sender="dispatch@acme-logistics.example",
        subject="Shipment confirmation - PO 4821",
        received_at="2026-02-02T08:14:00.000Z",
        body_text="Container MSCU7654321 departs Rotterdam.",
    )


def ok_response(parsed: Any = None, **overrides: Any) -> SimpleNamespace:
    """A successful Responses API payload, shaped like the SDK's object.

    Attribute access, matching `ParsedResponse`; the provider reads nothing the
    real SDK does not provide.
    """
    payload: dict[str, Any] = {
        "model": "test-extraction-model-2026-01-01",
        "status": "completed",
        "output_parsed": parsed if parsed is not None else load_fixture("extraction/complete.json"),
        "output": [],
        "incomplete_details": None,
        "error": None,
        "usage": SimpleNamespace(
            input_tokens=1_200,
            output_tokens=340,
            input_tokens_details=SimpleNamespace(cached_tokens=128),
            output_tokens_details=SimpleNamespace(reasoning_tokens=64),
            total_tokens=1_540,
        ),
    }
    payload.update(overrides)
    return SimpleNamespace(**payload)


class StubResponses:
    """Records every call, then returns or raises what the test set up."""

    def __init__(self, behaviour: Callable[[], Any]) -> None:
        self._behaviour = behaviour
        self.calls: list[dict[str, Any]] = []

    async def parse(self, **params: Any) -> Any:
        self.calls.append(params)
        return self._behaviour()


class StubClient:
    """Stands in for `AsyncOpenAI` at the single seam the provider exposes."""

    def __init__(self, behaviour: Callable[[], Any]) -> None:
        self.responses = StubResponses(behaviour)

    @property
    def calls(self) -> list[dict[str, Any]]:
        return self.responses.calls


def returns(value: Any) -> Callable[[], Any]:
    return lambda: value


def raises(error: BaseException) -> Callable[[], Any]:
    def behaviour() -> Any:
        raise error

    return behaviour
