"""The `extraction` operation: the one AI operation with a caller today.

Everything that can be decided without a model is decided without one. Schema
conformance, enum membership, missing values and self-contradiction are checked
deterministically after the call, which is why no conflict-resolution call is
needed to notice that the model contradicted itself.
"""

import logging

from pydantic import ValidationError

from ai_service.errors import AiConfigurationError, AiError
from ai_service.extraction.integrity import verify_extraction_integrity
from ai_service.models.common import ValidationIssue
from ai_service.models.extraction import ShipmentExtraction
from ai_service.models.wire import ExtractRequest, ExtractResponse, OperationMetadata
from ai_service.prompts.shipment_extraction import (
    SHIPMENT_EXTRACTION_SYSTEM_PROMPT,
    build_extraction_user_content,
)
from ai_service.providers.base import (
    StructuredOutputProvider,
    StructuredOutputRequest,
    StructuredOutputResult,
)
from ai_service.util import utc_now_iso

logger = logging.getLogger(__name__)


class ExtractionService:
    """Runs extraction for one email and reports the outcome.

    Never raises for a failure the API should record: a refusal, a timeout, a
    rate limit, unusable output and a self-contradictory extraction all come
    back as a `failed` response carrying a failure code, so the API can persist
    the attempt. Only a configuration problem propagates, because that is an
    operator's problem rather than this email's.
    """

    def __init__(self, provider: StructuredOutputProvider) -> None:
        self._provider = provider

    async def extract(self, request: ExtractRequest) -> ExtractResponse:
        try:
            result = await self._provider.complete(
                StructuredOutputRequest(
                    operation=request.operation,
                    text_format=ShipmentExtraction,
                    system=SHIPMENT_EXTRACTION_SYSTEM_PROMPT,
                    user_content=build_extraction_user_content(request.email),
                )
            )
        except AiConfigurationError:
            # An operator's problem, not this email's: it must not be recorded
            # as a verdict on the message. The route turns it into a 503.
            raise
        except AiError as error:
            # Every other code is an outcome of this attempt, and is reported
            # as one so the API can persist the failed run.
            return self._failed_call(request, error)

        metadata = self._succeeded_call(result)
        self._log_call(request, metadata)

        extraction, issues = self._validate(result.output)

        if extraction is None:
            logger.warning(
                "Extraction rejected for email %s: output failed the contract (%d issue(s))",
                request.email.id,
                len(issues),
            )
            return ExtractResponse(
                status="failed",
                failure_code="invalid_output",
                failure_message=(
                    "The model returned output that did not match the extraction schema."
                ),
                validation_errors=issues,
                operation=metadata,
            )

        # Deterministic, no model call: catches an extraction that contradicts
        # itself — in particular a conflicted field that was nonetheless given
        # a single value, which would silently discard contradictory evidence.
        integrity_issues = verify_extraction_integrity(extraction)

        if integrity_issues:
            logger.warning(
                "Extraction rejected for email %s: self-contradictory (%d issue(s))",
                request.email.id,
                len(integrity_issues),
            )
            return ExtractResponse(
                status="failed",
                failure_code="invalid_output",
                failure_message=(
                    "The model returned a self-contradictory extraction; conflicting "
                    "evidence must be preserved, not resolved."
                ),
                validation_errors=integrity_issues,
                operation=metadata,
            )

        return ExtractResponse(status="succeeded", extraction=extraction, operation=metadata)

    # --- validation ---------------------------------------------------------

    def _validate(self, output: object) -> tuple[ShipmentExtraction | None, list[ValidationIssue]]:
        """Validate the model's output against the extraction contract.

        Strict decoding constrains shape and enum membership, but the contract
        is the authority on whether this output is usable — and `output_parsed`
        is absent on refusals and truncation.
        """
        if isinstance(output, ShipmentExtraction):
            extraction = output
        else:
            try:
                extraction = ShipmentExtraction.model_validate(output)
            except ValidationError as error:
                return None, [
                    ValidationIssue(
                        path=".".join(str(part) for part in issue["loc"]) or "(root)",
                        message=issue["msg"],
                    )
                    for issue in error.errors()
                ]

        return extraction, []

    # --- per-operation accounting -------------------------------------------

    def _succeeded_call(self, result: StructuredOutputResult) -> OperationMetadata:
        return OperationMetadata(
            operation=result.operation,
            provider=result.provider,
            model=result.model,
            status="succeeded",
            failure_code=None,
            input_tokens=result.usage.input_tokens,
            output_tokens=result.usage.output_tokens,
            cached_input_tokens=result.usage.cached_input_tokens,
            reasoning_tokens=result.usage.reasoning_tokens,
            latency_ms=result.latency_ms,
            stop_reason=result.stop_reason,
            completed_at=utc_now_iso(),
        )

    def _failed_call(self, request: ExtractRequest, error: AiError) -> ExtractResponse:
        """A failed call is still recorded: knowing which model failed, and
        whether it burned time first, is the point of this accounting."""
        metadata = OperationMetadata(
            operation=request.operation,
            provider=self._provider.name,
            model=error.model or "unknown",
            status="failed",
            failure_code=error.code,
            input_tokens=None,
            output_tokens=None,
            cached_input_tokens=None,
            reasoning_tokens=None,
            latency_ms=error.latency_ms or 0,
            stop_reason=None,
            completed_at=utc_now_iso(),
        )
        self._log_call(request, metadata)

        return ExtractResponse(
            status="failed",
            failure_code=error.code,
            failure_message=error.message,
            validation_errors=error.issues or None,
            operation=metadata,
        )

    def _log_call(self, request: ExtractRequest, metadata: OperationMetadata) -> None:
        """Ids, routing, accounting and outcome only — never prompt, email
        content or evidence spans."""
        logger.info(
            "Email %s: %s on %s (%s) %s in %dms [in %s, out %s, cached %s]%s",
            request.email.id,
            metadata.operation,
            metadata.model,
            metadata.provider,
            metadata.status,
            metadata.latency_ms,
            metadata.input_tokens,
            metadata.output_tokens,
            metadata.cached_input_tokens,
            f" code={metadata.failure_code}" if metadata.failure_code else "",
        )
