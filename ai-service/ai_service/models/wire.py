"""The internal HTTP contract between the NestJS API and this service.

Mirrored on the TypeScript side by `packages/contracts/src/ai-service.ts`, and
pinned by shared fixtures in `test/fixtures/` that both languages validate, so
the two cannot drift apart silently.

Nothing in here carries a credential, in either direction: the API sends email
content and the operation it wants, and gets back validated structured output
plus accounting for the model call.
"""

from typing import Literal

from ai_service.models.base import WireModel
from ai_service.models.common import ValidationIssue
from ai_service.models.extraction import ShipmentExtraction
from ai_service.operations import AiOperation


class EmailPayload(WireModel):
    """The message to operate on, as the API stores it."""

    #: Only for correlating logs across the two services. Never used to fetch
    #: anything: this service has no database access.
    id: str | None = None
    sender: str
    subject: str
    #: ISO-8601 with an offset, exactly as the API holds it.
    received_at: str
    body_text: str


class ExtractRequest(WireModel):
    """Body of `POST /internal/v1/ai/extract`.

    ``operation`` is explicit rather than implied by the path: the API states
    which operation it wants, and a request for an operation that has no
    implementation yet is rejected by request validation instead of quietly
    running a different one. Routing is configured for all four operations
    (see `ai_service.registry`); only ``extraction`` is implemented.
    """

    operation: Literal["extraction"]
    email: EmailPayload


class OperationMetadata(WireModel):
    """What one model call cost and which model actually served it.

    Mirrors `operationMetadataSchema` in `packages/contracts`, so the API can
    persist it verbatim.

    ``model`` is the id the provider reported handling the request — not the id
    that was requested — so an alias resolving to a dated snapshot is captured
    as what really ran.
    """

    operation: AiOperation
    provider: str
    model: str
    status: Literal["succeeded", "failed"]
    #: Set when ``status`` is ``failed``.
    failure_code: str | None
    input_tokens: int | None
    output_tokens: int | None
    #: Portion of ``input_tokens`` served from the provider's prompt cache.
    cached_input_tokens: int | None
    #: Reasoning tokens, when the model reports them separately.
    reasoning_tokens: int | None
    latency_ms: int
    #: Why generation stopped, as the provider described it.
    stop_reason: str | None
    completed_at: str


class ExtractResponse(WireModel):
    """Result of `POST /internal/v1/ai/extract`.

    A `200` means the operation was performed and its outcome is reported, not
    that it succeeded — check ``status``. The API persists either outcome and
    sets the analysis status accordingly; it marks an analysis completed only
    once this says ``succeeded``, the extraction re-validates against the
    shared contract, and the write lands.
    """

    status: Literal["succeeded", "failed"]
    #: Present only when ``status`` is ``succeeded``.
    extraction: ShipmentExtraction | None = None
    #: Present when the model answered but its output was unusable.
    validation_errors: list[ValidationIssue] | None = None
    failure_code: str | None = None
    #: Short, operator-safe explanation. Never contains email content,
    #: the prompt, or any credential.
    failure_message: str | None = None
    #: Accounting for the model call. ``None`` only when no call was made.
    operation: OperationMetadata | None = None


class HealthResponse(WireModel):
    """Liveness. Succeeds whenever the process accepts requests."""

    status: Literal["ok"]
    service: str
    version: str
    uptime_seconds: float
    timestamp: str


class ReadinessResponse(WireModel):
    """Readiness.

    ``provider`` is ``up`` when a provider and credential are configured and
    ``disabled`` when they are not. It is deliberately *not* a live call to
    OpenAI: probing a paid API on every readiness check would cost money and
    add latency, so a configured credential is reported as configured, not as
    verified.
    """

    status: Literal["ok"]
    dependencies: dict[str, Literal["up", "disabled"]]
    #: Operation-to-model routing, for diagnostics. Empty when unconfigured.
    models: dict[str, str]
    #: Operations with a caller in this service today.
    implemented_operations: list[str]
    timestamp: str


class ErrorResponse(WireModel):
    """Body of every non-2xx response from this service."""

    status_code: int
    message: str
    failure_code: str | None = None
