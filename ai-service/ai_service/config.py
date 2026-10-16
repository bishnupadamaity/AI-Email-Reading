"""Configuration, validated once at startup.

Reads the repository-root `.env` — the same single file the API, the worker and
Vite use — so the LLM variables keep the names they already had
(`LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL_*`, …) and an existing local
`.env` works unchanged. Values already present in the process environment win
over the file, so container and CI configuration cannot be silently overridden
by a stray local file.

Nothing here is read anywhere but at construction: services receive the
settings they need, and never reach for the environment themselves.
"""

import logging
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from ai_service.operations import AiOperation

#: Addresses that keep the service off the network. Binding anywhere else
#: requires a token — see :meth:`Settings.check_exposure`.
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})

MAX_UPWARD_LEVELS = 6


def find_env_file(start: Path | None = None, file_name: str = ".env") -> Path | None:
    """Walk up from ``start`` looking for a dotenv file.

    In this monorepo the file lives at the repository root while processes
    start inside a top-level app directory (`frontend/`, `backend/`,
    `ai-service/`). Mirrors `findEnvFile` in `packages/config`.
    """
    current = (start or Path.cwd()).resolve()

    for _ in range(MAX_UPWARD_LEVELS + 1):
        candidate = current / file_name
        if candidate.is_file():
            return candidate
        if current.parent == current:
            break
        current = current.parent

    return None


class Settings(BaseSettings):
    """Every environment variable this service reads."""

    model_config = SettingsConfigDict(
        env_file=find_env_file(),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- HTTP surface ------------------------------------------------------
    #: Loopback by default: this service is internal, and nothing but the API
    #: should be able to reach it.
    ai_service_host: str = "127.0.0.1"
    ai_service_port: int = Field(default=8000, ge=1, le=65_535)
    #: Shared secret the API must present as `Authorization: Bearer …`.
    #: Required whenever the service binds to a non-loopback address.
    ai_service_token: SecretStr | None = None
    log_level: str = "info"

    # --- Provider ----------------------------------------------------------
    #: ``none`` keeps the service runnable without credentials: it starts,
    #: health checks pass, and an AI request fails with an explicit
    #: configuration error instead of a fabricated result.
    llm_provider: Literal["none", "openai"] = "none"
    #: Preferred credential. ``LLM_API_KEY`` is accepted as a fallback.
    #: Never logged, never echoed in a response.
    openai_api_key: SecretStr | None = None
    llm_api_key: SecretStr | None = None
    llm_timeout_ms: int = Field(default=60_000, ge=1_000)
    llm_max_output_tokens: int = Field(default=16_000, ge=1_024)
    llm_max_retries: int = Field(default=2, ge=0)
    llm_max_input_chars: int = Field(default=200_000, ge=1_000)

    # --- Model per AI operation -------------------------------------------
    # Left as raw strings so the defaults in `ModelRegistry` stay the single
    # source of truth. An empty variable means "unset"; see `model_overrides`.
    openai_model_classification: str = ""
    openai_model_extraction: str = ""
    openai_model_summarization: str = ""
    openai_model_conflict_resolution: str = ""

    @model_validator(mode="after")
    def check_exposure(self) -> "Settings":
        """Refuse to start unauthenticated on a reachable address.

        A service that performs paid model calls must not be open to whatever
        can route to it. Loopback is the exception, because there the operating
        system is the network restriction.
        """
        if self.ai_service_host not in LOOPBACK_HOSTS and self.ai_service_token is None:
            raise ValueError(
                f'AI_SERVICE_HOST is "{self.ai_service_host}", which is reachable from '
                "outside this machine, but AI_SERVICE_TOKEN is not set. Set a token "
                "(and the same value for the API), or bind to 127.0.0.1."
            )
        return self

    @property
    def api_key(self) -> str | None:
        """The provider credential, or ``None`` when AI is unconfigured.

        ``OPENAI_API_KEY`` is what the OpenAI SDK and CLI already use, so it is
        preferred; ``LLM_API_KEY`` stays supported as the project's own name.
        """
        for candidate in (self.openai_api_key, self.llm_api_key):
            if candidate is not None and candidate.get_secret_value().strip():
                return candidate.get_secret_value().strip()
        return None

    @property
    def ai_configured(self) -> bool:
        """Whether an AI operation can actually run."""
        return self.llm_provider == "openai" and self.api_key is not None

    @property
    def model_overrides(self) -> Mapping[AiOperation, str | None]:
        """Per-operation overrides an operator has pinned.

        An empty variable is treated as unset, so `OPENAI_MODEL_EXTRACTION=`
        in a `.env` means "use the default" rather than "use no model".
        A whitespace-only value is *not* silently accepted: the registry
        rejects it and names the variable.
        """
        raw: dict[AiOperation, str] = {
            "classification": self.openai_model_classification,
            "extraction": self.openai_model_extraction,
            "summarization": self.openai_model_summarization,
            "conflict_resolution": self.openai_model_conflict_resolution,
        }
        return {operation: value for operation, value in raw.items() if value != ""}

    @property
    def logging_level(self) -> int:
        """`LOG_LEVEL` as a `logging` level, defaulting to INFO if unknown."""
        name = self.log_level.strip().upper()
        return logging.getLevelNamesMapping().get(
            "WARNING" if name == "WARN" else name, logging.INFO
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Resolve the settings once per process."""
    return Settings()


def reset_settings_cache() -> None:
    """Clear the memoised settings. Intended for tests only."""
    get_settings.cache_clear()
