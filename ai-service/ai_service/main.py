"""Application entry point.

Run with `uvicorn ai_service.main:app` in development, or `python -m
ai_service.main` / the `ai-service` script, which reads the host and port from
configuration.

Configuration is resolved and the provider built once, at startup, so a
misconfigured process fails here rather than at the first request — the one
exception being missing credentials, which deliberately leave the service
bootable with every AI request failing loudly.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from ai_service import __version__
from ai_service.api.routes import ai_router, health_router
from ai_service.config import Settings, get_settings
from ai_service.providers.factory import create_provider

logger = logging.getLogger(__name__)


def configure_logging(settings: Settings) -> None:
    """One format for the whole process.

    Logs carry ids, operation, model, provider, status, token counts, latency
    and failure codes. They never carry the API key, the prompt, the email
    body, or the `evidence` spans — which reproduce message content and are
    returned to the API, never logged.
    """
    logging.basicConfig(
        level=settings.logging_level,
        format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
        force=True,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the application.

    Takes settings so tests can construct an app against an explicit
    environment instead of mutating the process one.
    """
    resolved = settings or get_settings()
    configure_logging(resolved)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "AI service %s starting on %s:%d (provider %s)",
            __version__,
            resolved.ai_service_host,
            resolved.ai_service_port,
            resolved.llm_provider,
        )
        if resolved.ai_service_token is None:
            logger.info(
                "No AI_SERVICE_TOKEN set; the internal endpoints are unauthenticated "
                "and reachable only from this machine."
            )
        yield
        logger.info("AI service stopping")

    app = FastAPI(
        title="Email AI Platform — AI service",
        description=(
            "Internal service performing the platform's AI operations: OpenAI "
            "provider integration, operation-to-model routing and structured email "
            "extraction. Not for public exposure."
        ),
        version=__version__,
        lifespan=lifespan,
    )

    # Resolved once: the provider owns an HTTP connection pool, and the routing
    # table is validated here so a typo fails at startup.
    app.state.settings = resolved
    app.state.provider = create_provider(resolved)

    app.include_router(health_router)
    app.include_router(ai_router)

    @app.exception_handler(RequestValidationError)
    async def on_invalid_request(request: Request, error: RequestValidationError) -> JSONResponse:
        """Report *which* fields were wrong, without echoing their values.

        A rejected request body contains email content; repeating the offending
        input in the response (FastAPI's default) would copy message text into
        the caller's logs.
        """
        paths = sorted(
            {
                ".".join(str(part) for part in issue["loc"][1:]) or "(root)"
                for issue in error.errors()
            }
        )
        return JSONResponse(
            status_code=422,
            content={
                "statusCode": 422,
                "message": f"Request validation failed for: {', '.join(paths)}",
                "failureCode": None,
            },
        )

    @app.exception_handler(HTTPException)
    async def on_http_exception(request: Request, error: HTTPException) -> JSONResponse:
        """Normalise every error body to the service's `ErrorResponse` shape."""
        detail: Any = error.detail
        if isinstance(detail, dict):
            content: dict[str, Any] = detail
        else:
            content = {
                "statusCode": error.status_code,
                "message": str(detail),
                "failureCode": None,
            }
        return JSONResponse(status_code=error.status_code, content=content, headers=error.headers)

    @app.exception_handler(Exception)
    async def on_unexpected(request: Request, error: Exception) -> JSONResponse:
        """Log the stack server-side; return nothing about it.

        An exception message can contain anything, including message content,
        so none of it reaches the caller.
        """
        logger.exception("Unhandled error serving %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "statusCode": 500,
                "message": "An unexpected error occurred.",
                "failureCode": None,
            },
        )

    return app


#: The ASGI application. `uvicorn ai_service.main:app` serves this.
app = create_app()


def run() -> None:
    """Start the server on the configured host and port."""
    import uvicorn

    settings = get_settings()
    uvicorn.run(app, host=settings.ai_service_host, port=settings.ai_service_port)


if __name__ == "__main__":
    run()
