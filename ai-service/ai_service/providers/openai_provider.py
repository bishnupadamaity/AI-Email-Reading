"""OpenAI-backed structured output, over the Responses API.

The model for each call comes from the `ModelRegistry` keyed by operation —
this adapter never holds a model name of its own, which is what lets extraction
and (later) conflict resolution run on different models through one code path.

Decoding is constrained with Structured Outputs: `responses.parse` builds a
strict JSON Schema from the Pydantic contract (`additionalProperties: false`,
every property required) and OpenAI enforces `enum` membership during decoding
as well as object shape. The caller nevertheless validates the result against
the contract: the contract is the authority on usability, and `output_parsed`
is absent on refusals and truncation.
"""

import logging
from dataclasses import dataclass
from typing import Any, Protocol, cast

import openai
from langsmith import Client as LangSmithClient
from langsmith.wrappers import wrap_openai
from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from ai_service.errors import AiConfigurationError, AiError
from ai_service.models.common import ValidationIssue
from ai_service.operations import AiOperation
from ai_service.providers.base import (
    StructuredOutputRequest,
    StructuredOutputResult,
    StructuredOutputUsage,
)
from ai_service.registry import ModelRegistry
from ai_service.util import monotonic_ms

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class OpenAiProviderOptions:
    """Credentials and transport limits. Not model selection."""

    #: Never logged, never returned.
    api_key: str
    #: Per-request deadline in milliseconds.
    timeout_ms: int
    max_output_tokens: int
    #: Retries the SDK performs for 429/5xx/connection errors.
    max_retries: int
    #: Upper bound on prompt characters. Oversized input is rejected rather
    #: than truncated — a silently shortened email produces a confidently
    #: wrong result, which is worse than a visible failure.
    max_input_chars: int
    #: Off by default. When on, every call is traced to LangSmith — prompt,
    #: completion and all — so this is strictly opt-in.
    langsmith_tracing: bool = False
    #: Never logged, never returned.
    langsmith_api_key: str | None = None
    langsmith_project: str = "email-ai-platform"
    langsmith_endpoint: str = ""


class ResponsesNamespace(Protocol):
    """The one SDK call this adapter makes, so tests can stub it."""

    async def parse(self, **params: Any) -> Any: ...


class ResponsesClient(Protocol):
    """Minimal shape this adapter needs from the SDK."""

    @property
    def responses(self) -> ResponsesNamespace: ...


class OpenAiStructuredProvider:
    """Structured output from OpenAI, routed per operation."""

    name = "openai"

    def __init__(
        self,
        options: OpenAiProviderOptions,
        registry: ModelRegistry,
        client: ResponsesClient | None = None,
    ) -> None:
        if not options.api_key:
            raise AiConfigurationError(
                'LLM_PROVIDER is "openai" but no API key is set. '
                "Provide OPENAI_API_KEY (or LLM_API_KEY)."
            )

        self._options = options
        self._registry = registry
        self._client: ResponsesClient = client or cast(
            "ResponsesClient", self._build_sdk_client(options)
        )

    @staticmethod
    def _build_sdk_client(options: OpenAiProviderOptions) -> AsyncOpenAI:
        sdk_client = AsyncOpenAI(
            api_key=options.api_key,
            # The OpenAI SDK takes seconds.
            timeout=options.timeout_ms / 1_000,
            max_retries=options.max_retries,
        )

        if not options.langsmith_tracing:
            return sdk_client

        # A `Client` is built explicitly from `options` rather than letting the
        # SDK read `LANGSMITH_API_KEY`/`LANGSMITH_ENDPOINT` off the process
        # environment, so tracing configuration flows through `Settings` like
        # everything else in this adapter.
        ls_client = LangSmithClient(
            api_key=options.langsmith_api_key,
            api_url=options.langsmith_endpoint or None,
        )
        return wrap_openai(sdk_client, tracing_extra={"client": ls_client})

    def describe_routing(self) -> dict[AiOperation, str]:
        return self._registry.describe()

    async def complete(self, request: StructuredOutputRequest) -> StructuredOutputResult:
        model = self._registry.model_for(request.operation)

        prompt_chars = len(request.system) + len(request.user_content)
        if prompt_chars > self._options.max_input_chars:
            raise AiError(
                "input_too_large",
                f"Prompt is {prompt_chars} characters, above the "
                f"{self._options.max_input_chars} limit. Raise LLM_MAX_INPUT_CHARS "
                "or shorten the input.",
                operation=request.operation,
                model=model,
            )

        started_at = monotonic_ms()

        call_kwargs: dict[str, Any] = {
            "model": model,
            "instructions": request.system,
            "input": request.user_content,
            "max_output_tokens": self._options.max_output_tokens,
            "text_format": request.text_format,
        }
        if self._options.langsmith_tracing:
            # Routing only, mirroring `_log_call` elsewhere: never the prompt
            # or the email content as a *tag*, since tags are indexed and
            # searchable — the traced inputs/outputs carry that already.
            call_kwargs["langsmith_extra"] = {
                "project_name": self._options.langsmith_project,
                "metadata": {"operation": request.operation},
            }

        try:
            response = await self._client.responses.parse(**call_kwargs)
        except Exception as error:  # every failure is translated below
            raise self._translate(
                error, request.operation, model, monotonic_ms() - started_at
            ) from error

        latency_ms = monotonic_ms() - started_at
        served_by = _attr(response, "model") or model
        context: dict[str, Any] = {
            "operation": request.operation,
            "model": served_by,
            "latency_ms": latency_ms,
        }

        self._reject_unusable(response, context)

        return StructuredOutputResult(
            output=_plain(_attr(response, "output_parsed")),
            operation=request.operation,
            provider=self.name,
            model=served_by,
            usage=_read_usage(response),
            latency_ms=latency_ms,
            stop_reason=_attr(response, "status"),
        )

    def _reject_unusable(self, response: Any, context: dict[str, Any]) -> None:
        """Raise unless the response carries usable structured output."""
        if _find_refusal(response):
            raise AiError("refused", "The model declined to process this input.", **context)

        status = _attr(response, "status")

        if status == "incomplete":
            reason = _attr(_attr(response, "incomplete_details"), "reason") or "unknown"
            message = (
                "The model hit the output token limit before finishing. "
                "Raise LLM_MAX_OUTPUT_TOKENS."
                if reason == "max_output_tokens"
                else f"The provider returned an incomplete response ({reason})."
            )
            raise AiError("invalid_response", message, **context)

        if status in {"failed", "cancelled"}:
            # `error.code` is a provider-defined code, not free text, so it is
            # safe to surface; `error.message` can echo request content, so it
            # is not.
            code = _attr(_attr(response, "error"), "code")
            detail = f" ({code})" if code else ""
            raise AiError(
                "invalid_response",
                f"The provider reported the response as {status}{detail}.",
                **context,
            )

        if _attr(response, "output_parsed") is None:
            raise AiError(
                "invalid_response",
                "The provider returned no parseable structured output.",
                **context,
            )

    def _translate(
        self,
        error: Exception,
        operation: AiOperation,
        model: str,
        latency_ms: int,
    ) -> Exception:
        """Map SDK errors onto the port's failure codes.

        Only the status and a generic description are kept: provider error
        bodies can echo request content, which must not reach logs or clients.
        The one exception is a 400 about the response format, where the cause —
        an unsupported model — is reported as a configuration problem naming
        the model and operation.
        """
        if isinstance(error, AiError):
            return error

        context: dict[str, Any] = {
            "operation": operation,
            "model": model,
            "latency_ms": latency_ms,
        }

        if isinstance(error, ValidationError):
            # Strict decoding should make this impossible; when it happens the
            # model answered with something the contract rejects.
            return AiError(
                "invalid_output",
                "The model returned output that did not match the extraction schema.",
                issues=_issues_from(error),
                **context,
            )

        if isinstance(error, openai.APITimeoutError):
            return AiError(
                "timeout",
                f"The provider did not respond within {self._options.timeout_ms}ms.",
                **context,
            )

        if isinstance(error, openai.AuthenticationError | openai.PermissionDeniedError):
            return AiConfigurationError("The provider rejected the API key.", **context)

        if isinstance(error, openai.RateLimitError):
            return AiError("rate_limited", "The provider rate-limited this request.", **context)

        if isinstance(error, openai.NotFoundError):
            # A Responses API 404 on a model id means exactly one thing.
            return AiConfigurationError(
                f'Model "{model}" (configured for the {operation} operation) does not '
                "exist or is not available to this account.",
                **context,
            )

        if isinstance(error, openai.BadRequestError):
            # A model that cannot do Structured Outputs fails here. Report it
            # as a configuration problem naming the model — never silently
            # switch models.
            return AiConfigurationError(
                f'Model "{model}" (configured for the {operation} operation) rejected '
                f"the request: {error.code or 'bad_request'}. It may not support "
                "Structured Outputs on the Responses API. Set the operation's model "
                "explicitly rather than relying on a fallback.",
                **context,
            )

        if isinstance(error, openai.APIConnectionError):
            return AiError("unavailable", "Could not reach the provider.", **context)

        if isinstance(error, openai.APIStatusError):
            return AiError(
                "unavailable",
                f"The provider returned HTTP {error.status_code}.",
                **context,
            )

        if isinstance(error, openai.APIError):
            return AiError("unavailable", "The provider returned an error.", **context)

        return error


def _issues_from(error: ValidationError) -> list[ValidationIssue]:
    """Pydantic errors as contract issues, addressed by contract field name."""
    return [
        ValidationIssue(
            path=".".join(str(part) for part in issue["loc"]) or "(root)",
            message=issue["msg"],
        )
        for issue in error.errors()
    ]


def _find_refusal(response: Any) -> str | None:
    """Structured Outputs surfaces a safety refusal as a refusal output item."""
    for item in _attr(response, "output") or []:
        refusal = _attr(item, "refusal")
        if _attr(item, "type") == "refusal" and refusal:
            return str(refusal)

        for block in _attr(item, "content") or []:
            block_refusal = _attr(block, "refusal")
            if _attr(block, "type") == "refusal" and block_refusal:
                return str(block_refusal)

    return None


def _read_usage(response: Any) -> StructuredOutputUsage:
    usage = _attr(response, "usage")
    if usage is None:
        return StructuredOutputUsage()

    return StructuredOutputUsage(
        input_tokens=_attr(usage, "input_tokens"),
        output_tokens=_attr(usage, "output_tokens"),
        cached_input_tokens=_attr(_attr(usage, "input_tokens_details"), "cached_tokens"),
        reasoning_tokens=_attr(_attr(usage, "output_tokens_details"), "reasoning_tokens"),
    )


def _plain(output: Any) -> Any:
    """The output as plain data, so the port stays contract-agnostic."""
    if isinstance(output, BaseModel):
        return output.model_dump()
    return output


def _attr(source: Any, name: str) -> Any:
    """Read a field from an SDK model or a stub, tolerating either shape."""
    if source is None:
        return None
    if isinstance(source, dict):
        return source.get(name)
    return getattr(source, name, None)
