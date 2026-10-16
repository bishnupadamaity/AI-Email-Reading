"""Wiring and the authentication guard for the internal endpoints."""

import logging
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from ai_service.config import Settings
from ai_service.providers.base import StructuredOutputProvider
from ai_service.services.extraction_service import ExtractionService

logger = logging.getLogger(__name__)

BEARER_PREFIX = "Bearer "


def get_settings_dep(request: Request) -> Settings:
    """The settings resolved at startup and stored on the app."""
    settings: Settings = request.app.state.settings
    return settings


def get_provider(request: Request) -> StructuredOutputProvider:
    """The provider built at startup. One per process, so the SDK's connection
    pool is reused across requests."""
    provider: StructuredOutputProvider = request.app.state.provider
    return provider


def get_extraction_service(
    provider: Annotated[StructuredOutputProvider, Depends(get_provider)],
) -> ExtractionService:
    return ExtractionService(provider)


def require_internal_caller(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> None:
    """Authenticate the API as the caller of an internal endpoint.

    When `AI_SERVICE_TOKEN` is set, a matching `Authorization: Bearer …` header
    is required and compared in constant time. When it is unset the service
    must be on loopback — `Settings` refuses to start otherwise — so the
    operating system is the access control and the token is optional for local
    development.
    """
    if settings.ai_service_token is None:
        return

    header = request.headers.get("authorization", "")
    presented = header[len(BEARER_PREFIX) :] if header.startswith(BEARER_PREFIX) else ""

    if not secrets.compare_digest(presented, settings.ai_service_token.get_secret_value()):
        # No detail about what was wrong, and nothing from the header echoed
        # back.
        logger.warning("Rejected an unauthenticated request to %s", request.url.path)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid bearer token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
