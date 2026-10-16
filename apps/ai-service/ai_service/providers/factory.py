"""Builds the provider from configuration."""

import logging

from ai_service.config import Settings
from ai_service.providers.base import StructuredOutputProvider
from ai_service.providers.openai_provider import (
    OpenAiProviderOptions,
    OpenAiStructuredProvider,
)
from ai_service.providers.unconfigured import UnconfiguredProvider
from ai_service.registry import ModelRegistry

logger = logging.getLogger(__name__)


def create_provider(settings: Settings) -> StructuredOutputProvider:
    """Build the provider for this process.

    Provider configuration (credentials, timeouts) and operation-to-model
    routing come from the same settings object but are passed separately: they
    change for different reasons and are owned by different parts of the
    configuration.

    Returns the unconfigured stand-in — which raises on use — rather than
    failing at startup, so the service still boots and serves health checks
    without credentials. The failure surfaces when an operation is actually
    requested.

    The routing table is validated either way, so a typo in an operation with
    no caller yet is caught at startup rather than on the day it ships.
    """
    registry = ModelRegistry.create(settings.model_overrides)
    api_key = settings.api_key

    if settings.llm_provider != "openai" or api_key is None:
        logger.warning(
            "No LLM provider configured (LLM_PROVIDER=%s, api key %s). "
            "AI operations will fail with a configuration error.",
            settings.llm_provider,
            "set" if api_key else "unset",
        )
        return UnconfiguredProvider()

    logger.info("Model routing: %s", registry.describe())

    return OpenAiStructuredProvider(
        OpenAiProviderOptions(
            api_key=api_key,
            timeout_ms=settings.llm_timeout_ms,
            max_output_tokens=settings.llm_max_output_tokens,
            max_retries=settings.llm_max_retries,
            max_input_chars=settings.llm_max_input_chars,
        ),
        registry,
    )
