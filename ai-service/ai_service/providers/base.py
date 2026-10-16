"""Boundary between the service and whichever LLM backs an operation.

Only this port is used by the services, so no application code reaches a
vendor SDK directly.

Requests name an **operation**, not a model. The provider resolves the model
through the registry, which is what keeps routing in one place.
"""

from dataclasses import dataclass
from typing import Any, Protocol

from pydantic import BaseModel

from ai_service.operations import AiOperation


@dataclass(frozen=True, slots=True)
class StructuredOutputRequest:
    """One constrained-decoding request."""

    #: Selects the model, and is recorded against the result.
    operation: AiOperation
    #: Pydantic model used to constrain decoding. The caller still validates
    #: the result itself — see :attr:`StructuredOutputResult.output`.
    text_format: type[BaseModel]
    #: System-level instructions.
    system: str
    #: The content to operate on.
    user_content: str


@dataclass(frozen=True, slots=True)
class StructuredOutputUsage:
    """Token accounting for one call, as far as the provider reports it."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    cached_input_tokens: int | None = None
    reasoning_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class StructuredOutputResult:
    """What the provider returned, plus what it cost."""

    #: The model's output. Deliberately untyped: the Pydantic contract is the
    #: single authority on whether a result is usable, and strict decoding
    #: makes the right shape very likely, not certain.
    output: Any
    operation: AiOperation
    provider: str
    #: Model the provider reported handling the request.
    model: str
    usage: StructuredOutputUsage
    latency_ms: int
    stop_reason: str | None


class StructuredOutputProvider(Protocol):
    """What a service may assume about a provider."""

    @property
    def name(self) -> str: ...

    def describe_routing(self) -> dict[AiOperation, str]:
        """The model each operation routes to. For diagnostics and logging."""
        ...

    async def complete(self, request: StructuredOutputRequest) -> StructuredOutputResult:
        """Resolve only when the provider answered; otherwise raise `AiError`."""
        ...
