"""The service's endpoints.

Two groups, with different access rules:

- `/health` and `/health/ready` are unauthenticated, because probes should not
  need a credential, and they never reach the provider.
- `/internal/v1/ai/...` performs paid model calls and requires the shared
  token whenever one is configured.
"""

import logging
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from ai_service import __version__
from ai_service.api.deps import (
    get_extraction_service,
    get_provider,
    get_settings_dep,
    require_internal_caller,
)
from ai_service.config import Settings
from ai_service.errors import AiConfigurationError
from ai_service.models.wire import (
    ExtractRequest,
    ExtractResponse,
    HealthResponse,
    ReadinessResponse,
)
from ai_service.operations import IMPLEMENTED_OPERATIONS
from ai_service.providers.base import StructuredOutputProvider
from ai_service.services.extraction_service import ExtractionService
from ai_service.util import utc_now_iso

logger = logging.getLogger(__name__)

SERVICE_NAME = "email-ai-ai-service"
STARTED_AT = time.monotonic()

health_router = APIRouter(tags=["health"])
ai_router = APIRouter(
    prefix="/internal/v1/ai",
    tags=["ai"],
    dependencies=[Depends(require_internal_caller)],
)


@health_router.get("/health", response_model=HealthResponse, summary="Liveness probe")
def liveness() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=__version__,
        uptime_seconds=round(time.monotonic() - STARTED_AT, 3),
        timestamp=utc_now_iso(),
    )


@health_router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe: reports provider configuration and routing",
)
def readiness(
    settings: Annotated[Settings, Depends(get_settings_dep)],
    provider: Annotated[StructuredOutputProvider, Depends(get_provider)],
) -> ReadinessResponse:
    routing = provider.describe_routing()
    # Never a live call to OpenAI: a configured credential is reported as
    # configured, not as verified.
    return ReadinessResponse(
        status="ok",
        dependencies={
            "provider": "up" if settings.ai_configured else "disabled",
            "tracing": "up" if settings.langsmith_configured else "disabled",
        },
        models={str(operation): model for operation, model in routing.items()},
        implemented_operations=sorted(IMPLEMENTED_OPERATIONS),
        timestamp=utc_now_iso(),
    )


@ai_router.post(
    "/extract",
    response_model=ExtractResponse,
    response_model_exclude_none=False,
    summary="Run the extraction operation on one email",
    description=(
        "Returns `200` with the outcome of the run — check `status`. A `failed` "
        "response is a recorded outcome (refusal, timeout, rate limit, unusable or "
        "self-contradictory output), not a transport error. `503` means the service "
        "itself is misconfigured and no email will succeed until an operator fixes it."
    ),
)
async def extract(
    body: ExtractRequest,
    service: Annotated[ExtractionService, Depends(get_extraction_service)],
) -> ExtractResponse:
    try:
        return await service.extract(body)
    except AiConfigurationError as error:
        # Not this email's fault: surface it as "the service cannot serve
        # requests" so the caller can tell it apart from a failed extraction.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "statusCode": status.HTTP_503_SERVICE_UNAVAILABLE,
                "message": error.message,
                "failureCode": error.code,
            },
        ) from error
