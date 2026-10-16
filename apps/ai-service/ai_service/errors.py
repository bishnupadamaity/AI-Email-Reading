"""Failure vocabulary shared by the provider, the services and the HTTP layer.

Codes match `analysisFailureCodeSchema` in `packages/contracts`, so a failure
raised here can be persisted by the API without translation.
"""

from typing import Literal

from ai_service.models.common import ValidationIssue

#: Codes a provider or an AI operation can fail with.
#:
#: ``invalid_output`` comes from validation rather than from the provider: the
#: model answered, but its answer did not satisfy the extraction contract.
FailureCode = Literal[
    "configuration",
    "timeout",
    "rate_limited",
    "unavailable",
    "input_too_large",
    "refused",
    "invalid_response",
    "invalid_output",
]


class AiError(Exception):
    """A failure carrying a machine-readable code plus enough context to record
    which model failed.

    ``message`` is written for operators: it never contains the API key, the
    prompt, or any part of the email body. Provider error bodies can echo
    request content, so they are dropped rather than reworded.
    """

    def __init__(
        self,
        code: FailureCode,
        message: str,
        *,
        operation: str | None = None,
        model: str | None = None,
        latency_ms: int | None = None,
        issues: list[ValidationIssue] | None = None,
    ) -> None:
        super().__init__(message)
        self.code: FailureCode = code
        self.message = message
        self.operation = operation
        self.model = model
        self.latency_ms = latency_ms
        self.issues: list[ValidationIssue] = issues or []


class AiConfigurationError(AiError):
    """The provider is switched off, missing credentials, or pointed at a model
    it cannot use. Always actionable by an operator."""

    def __init__(
        self,
        message: str,
        *,
        operation: str | None = None,
        model: str | None = None,
        latency_ms: int | None = None,
    ) -> None:
        super().__init__(
            "configuration",
            message,
            operation=operation,
            model=model,
            latency_ms=latency_ms,
        )


class ModelConfigurationError(AiConfigurationError):
    """Operation-to-model configuration is unusable.

    Always names the offending operations and the environment variable that
    sets them, so the fix is obvious from the message alone.
    """
