"""Stand-in used when no provider is configured."""

from ai_service.errors import AiConfigurationError
from ai_service.operations import AiOperation
from ai_service.providers.base import StructuredOutputRequest, StructuredOutputResult

UNCONFIGURED_MESSAGE = (
    "No LLM provider is configured for the AI service. Set LLM_PROVIDER=openai "
    "and OPENAI_API_KEY to enable AI operations."
)


class UnconfiguredProvider:
    """Raises on every call rather than returning placeholder results.

    An unconfigured deployment must fail loudly when an operation is
    requested, not quietly produce fabricated output. Providing this (instead
    of nothing) keeps the service bootable without credentials, which the
    health endpoints and front-end development rely on.
    """

    name = "unconfigured"

    def describe_routing(self) -> dict[AiOperation, str]:
        return {}

    async def complete(self, request: StructuredOutputRequest) -> StructuredOutputResult:
        raise AiConfigurationError(UNCONFIGURED_MESSAGE, operation=request.operation)
