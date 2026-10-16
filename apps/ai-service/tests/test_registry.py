"""Operation-to-model routing.

Ported from `model-registry.spec.ts`, case for case, so the behaviour the
TypeScript registry guaranteed is still guaranteed.
"""

import pytest

from ai_service.errors import ModelConfigurationError
from ai_service.operations import AI_OPERATIONS
from ai_service.registry import DEFAULT_OPERATION_MODELS, MODEL_ENV_VARS, ModelRegistry


class TestDefaults:
    def test_maps_every_operation_with_no_configuration_at_all(self) -> None:
        registry = ModelRegistry.create()

        for operation in AI_OPERATIONS:
            assert registry.model_for(operation) == DEFAULT_OPERATION_MODELS[operation]

    def test_covers_every_declared_operation(self) -> None:
        # Guards against adding an operation to the enum and forgetting its
        # default, which would only surface the day it gets a caller.
        assert sorted(DEFAULT_OPERATION_MODELS) == sorted(AI_OPERATIONS)
        assert sorted(MODEL_ENV_VARS) == sorted(AI_OPERATIONS)

    def test_does_not_route_two_different_operations_to_one_model_by_accident(self) -> None:
        # classification and summarization intentionally share the cheap tier;
        # extraction and conflict_resolution must be distinct from them.
        registry = ModelRegistry.create()

        assert registry.model_for("extraction") != registry.model_for("classification")
        assert registry.model_for("conflict_resolution") != registry.model_for("extraction")

    def test_keeps_the_model_ids_the_typescript_implementation_used(self) -> None:
        # The migration reuses verified ids rather than inventing new ones; a
        # change here is a deliberate routing decision, not a refactor.
        assert dict(DEFAULT_OPERATION_MODELS) == {
            "classification": "gpt-6-luna",
            "extraction": "gpt-6-sol",
            "summarization": "gpt-6-luna",
            "conflict_resolution": "gpt-6-astra",
        }


class TestOverrides:
    def test_honours_an_override_for_a_single_operation(self) -> None:
        registry = ModelRegistry.create({"extraction": "gpt-5.4"})

        assert registry.model_for("extraction") == "gpt-5.4"
        # Others keep their defaults.
        assert registry.model_for("classification") == DEFAULT_OPERATION_MODELS["classification"]

    def test_honours_overrides_for_every_operation_independently(self) -> None:
        registry = ModelRegistry.create(
            {
                "classification": "model-c",
                "extraction": "model-e",
                "summarization": "model-s",
                "conflict_resolution": "model-r",
            }
        )

        assert registry.describe() == {
            "classification": "model-c",
            "extraction": "model-e",
            "summarization": "model-s",
            "conflict_resolution": "model-r",
        }

    def test_ignores_absent_overrides_rather_than_treating_them_as_empty(self) -> None:
        registry = ModelRegistry.create({"extraction": None})

        assert registry.model_for("extraction") == DEFAULT_OPERATION_MODELS["extraction"]

    def test_trims_surrounding_whitespace_from_a_configured_id(self) -> None:
        registry = ModelRegistry.create({"extraction": "  gpt-5.4-mini  "})

        assert registry.model_for("extraction") == "gpt-5.4-mini"


class TestInvalidConfiguration:
    def test_rejects_an_empty_override_and_names_the_variable_to_fix(self) -> None:
        with pytest.raises(ModelConfigurationError) as caught:
            ModelRegistry.create({"extraction": "   "})

        assert "OPENAI_MODEL_EXTRACTION" in str(caught.value)
        # Actionable: says what the default would be.
        assert DEFAULT_OPERATION_MODELS["extraction"] in str(caught.value)

    def test_rejects_a_model_id_containing_whitespace(self) -> None:
        with pytest.raises(ModelConfigurationError, match="OPENAI_MODEL_SUMMARIZATION"):
            ModelRegistry.create({"summarization": "gpt 5.4 mini"})

    def test_reports_every_bad_operation_at_once_not_just_the_first(self) -> None:
        with pytest.raises(ModelConfigurationError) as caught:
            ModelRegistry.create({"extraction": " ", "conflict_resolution": "a b"})

        assert "OPENAI_MODEL_EXTRACTION" in str(caught.value)
        assert "OPENAI_MODEL_CONFLICT_RESOLUTION" in str(caught.value)

    def test_validates_operations_that_have_no_caller_yet(self) -> None:
        # conflict_resolution is not wired up; a typo in it must still fail
        # loudly at startup.
        with pytest.raises(ModelConfigurationError):
            ModelRegistry.create({"conflict_resolution": " "})


class TestDescribe:
    def test_returns_a_copy_that_cannot_mutate_the_registry(self) -> None:
        registry = ModelRegistry.create()
        table = registry.describe()
        table["extraction"] = "tampered"

        assert registry.model_for("extraction") == DEFAULT_OPERATION_MODELS["extraction"]
