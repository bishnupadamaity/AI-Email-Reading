"""Configuration: environment overrides, missing configuration, and the rules
that keep this service from being exposed or leaking a credential."""

from collections.abc import Callable
from pathlib import Path

import pytest
from pydantic import ValidationError

from ai_service.config import Settings, find_env_file, get_settings, reset_settings_cache
from ai_service.providers.factory import create_provider
from ai_service.providers.unconfigured import UnconfiguredProvider
from ai_service.registry import DEFAULT_OPERATION_MODELS

SettingsFactory = Callable[..., Settings]


class TestDefaults:
    def test_starts_unconfigured_so_the_service_boots_without_credentials(
        self, settings_factory: SettingsFactory
    ) -> None:
        settings = settings_factory()

        assert settings.llm_provider == "none"
        assert settings.api_key is None
        assert settings.ai_configured is False

    def test_binds_to_loopback_by_default(self, settings_factory: SettingsFactory) -> None:
        settings = settings_factory()

        assert settings.ai_service_host == "127.0.0.1"
        assert settings.ai_service_port == 8000

    def test_keeps_the_transport_limits_the_typescript_provider_used(
        self, settings_factory: SettingsFactory
    ) -> None:
        settings = settings_factory()

        assert settings.llm_timeout_ms == 60_000
        assert settings.llm_max_output_tokens == 16_000
        assert settings.llm_max_retries == 2
        assert settings.llm_max_input_chars == 200_000


class TestCredentials:
    def test_prefers_openai_api_key(self, settings_factory: SettingsFactory) -> None:
        settings = settings_factory(
            llm_provider="openai", openai_api_key="sk-preferred", llm_api_key="sk-fallback"
        )

        assert settings.api_key == "sk-preferred"
        assert settings.ai_configured is True

    def test_accepts_llm_api_key_as_a_fallback(self, settings_factory: SettingsFactory) -> None:
        settings = settings_factory(llm_provider="openai", llm_api_key="sk-fallback")

        assert settings.api_key == "sk-fallback"

    def test_treats_an_empty_key_as_unset(self, settings_factory: SettingsFactory) -> None:
        settings = settings_factory(llm_provider="openai", openai_api_key="   ")

        assert settings.api_key is None
        assert settings.ai_configured is False

    def test_a_provider_without_a_key_is_not_configured(
        self, settings_factory: SettingsFactory
    ) -> None:
        settings = settings_factory(llm_provider="openai")

        assert settings.ai_configured is False

    def test_never_puts_the_key_in_a_repr_or_a_dump(
        self, settings_factory: SettingsFactory
    ) -> None:
        settings = settings_factory(llm_provider="openai", openai_api_key="sk-secret-value")

        # `SecretStr` is what makes this true; asserting it stops a plain `str`
        # being substituted later.
        assert "sk-secret-value" not in repr(settings)
        assert "sk-secret-value" not in str(settings.model_dump())


class TestModelOverrides:
    def test_passes_only_pinned_operations_to_the_registry(
        self, settings_factory: SettingsFactory
    ) -> None:
        settings = settings_factory(openai_model_extraction="gpt-6-astra")

        assert settings.model_overrides == {"extraction": "gpt-6-astra"}

    def test_treats_an_empty_variable_as_unset_so_the_default_applies(
        self, settings_factory: SettingsFactory
    ) -> None:
        # `OPENAI_MODEL_EXTRACTION=` in a .env must mean "use the default",
        # which is how the TypeScript configuration behaved.
        settings = settings_factory(openai_model_extraction="")

        assert settings.model_overrides == {}
        provider = create_provider(settings)
        assert provider.describe_routing() in ({}, dict(DEFAULT_OPERATION_MODELS))

    def test_does_not_silently_accept_a_whitespace_only_variable(
        self, settings_factory: SettingsFactory
    ) -> None:
        settings = settings_factory(openai_model_classification="   ")

        assert settings.model_overrides == {"classification": "   "}

    def test_reads_every_operation_variable(self, settings_factory: SettingsFactory) -> None:
        settings = settings_factory(
            openai_model_classification="c",
            openai_model_extraction="e",
            openai_model_summarization="s",
            openai_model_conflict_resolution="r",
        )

        assert settings.model_overrides == {
            "classification": "c",
            "extraction": "e",
            "summarization": "s",
            "conflict_resolution": "r",
        }


class TestExposureGuard:
    def test_refuses_to_start_unauthenticated_on_a_reachable_address(
        self, settings_factory: SettingsFactory
    ) -> None:
        with pytest.raises(ValidationError, match="AI_SERVICE_TOKEN"):
            settings_factory(ai_service_host="0.0.0.0")  # noqa: S104 - the point of the test

    def test_allows_a_reachable_address_with_a_token(
        self, settings_factory: SettingsFactory
    ) -> None:
        settings = settings_factory(ai_service_host="0.0.0.0", ai_service_token="shared")  # noqa: S104

        assert settings.ai_service_token is not None

    @pytest.mark.parametrize("host", ["127.0.0.1", "::1", "localhost"])
    def test_allows_loopback_without_a_token(
        self, settings_factory: SettingsFactory, host: str
    ) -> None:
        assert settings_factory(ai_service_host=host).ai_service_token is None


class TestInvalidValues:
    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("llm_provider", "anthropic"),
            ("ai_service_port", 0),
            ("ai_service_port", 70_000),
            ("llm_timeout_ms", 10),
            ("llm_max_output_tokens", 5),
            ("llm_max_retries", -1),
            ("llm_max_input_chars", 10),
        ],
    )
    def test_rejects_a_value_outside_its_range(
        self, settings_factory: SettingsFactory, field: str, value: object
    ) -> None:
        with pytest.raises(ValidationError):
            settings_factory(**{field: value})


class TestLogLevel:
    @pytest.mark.parametrize(
        ("configured", "expected"),
        [("debug", 10), ("INFO", 20), ("warn", 30), ("warning", 30), ("error", 40)],
    )
    def test_maps_log_level_names(
        self, settings_factory: SettingsFactory, configured: str, expected: int
    ) -> None:
        assert settings_factory(log_level=configured).logging_level == expected

    def test_falls_back_to_info_for_an_unknown_level(
        self, settings_factory: SettingsFactory
    ) -> None:
        assert settings_factory(log_level="chatty").logging_level == 20


class TestEnvFileDiscovery:
    def test_finds_the_repository_root_dotenv_from_this_service(self) -> None:
        # The whole monorepo shares one `.env`; this service must read the same
        # file as the API.
        found = find_env_file(Path(__file__).resolve().parent)

        assert found is None or found.parent == Path(__file__).resolve().parents[2]

    def test_stops_instead_of_walking_to_the_filesystem_root(self, tmp_path: Path) -> None:
        assert find_env_file(tmp_path) is None


class TestUnconfiguredProvider:
    def test_the_factory_yields_the_stand_in_when_nothing_is_configured(
        self, settings_factory: SettingsFactory
    ) -> None:
        provider = create_provider(settings_factory())

        assert isinstance(provider, UnconfiguredProvider)
        assert provider.name == "unconfigured"

    def test_validates_routing_even_when_the_provider_is_off(
        self, settings_factory: SettingsFactory
    ) -> None:
        # A typo in an unused operation must fail at startup, not on the day
        # that operation ships.
        from ai_service.errors import ModelConfigurationError

        with pytest.raises(ModelConfigurationError, match="OPENAI_MODEL_SUMMARIZATION"):
            create_provider(settings_factory(openai_model_summarization="  "))


class TestCaching:
    def test_resolves_the_settings_once_per_process(self) -> None:
        reset_settings_cache()

        assert get_settings() is get_settings()
