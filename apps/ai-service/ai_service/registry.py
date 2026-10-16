"""Operation-to-model routing.

The single place that knows model identifiers. Services ask for an operation,
never for a model name, so adding or re-pointing an operation does not touch
any service — and no service reads the environment.
"""

from collections.abc import Mapping
from types import MappingProxyType

from ai_service.errors import ModelConfigurationError
from ai_service.operations import AI_OPERATIONS, AiOperation

#: Environment variable that configures each operation's model.
MODEL_ENV_VARS: Mapping[AiOperation, str] = MappingProxyType(
    {
        "classification": "OPENAI_MODEL_CLASSIFICATION",
        "extraction": "OPENAI_MODEL_EXTRACTION",
        "summarization": "OPENAI_MODEL_SUMMARIZATION",
        "conflict_resolution": "OPENAI_MODEL_CONFLICT_RESOLUTION",
    }
)

#: Default model per operation.
#:
#: Carried over unchanged from the TypeScript `ModelRegistry`, after confirming
#: all three ids exist, are reachable through the Responses API and support
#: Structured Outputs. Chosen from OpenAI's published per-million-token prices
#: (read 2026-10-15 — re-check before trusting them, they change):
#:
#: | model       | input  | output |
#: | ----------- | ------ | ------ |
#: | gpt-6-luna  | $0.10  | $0.50  |
#: | gpt-6-sol   | $2.00  | $10.00 |
#: | gpt-6-astra | $10.00 | $50.00 |
#:
#: - ``classification`` and ``summarization`` get the cheapest tier: both
#:   produce a short answer from text that is already in front of the model.
#: - ``extraction`` gets the mid tier. It is the only operation whose output
#:   must satisfy a strict schema across sixteen fields with evidence spans,
#:   and it is the one running today.
#: - ``conflict_resolution`` gets the most capable tier: weighing contradictory
#:   statements is the hardest job here, and it runs rarely by design.
#:
#: Every value is overridable. Nothing in this table is load-bearing for
#: correctness — a wrong guess costs money or quality, never integrity.
DEFAULT_OPERATION_MODELS: Mapping[AiOperation, str] = MappingProxyType(
    {
        "classification": "gpt-6-luna",
        "extraction": "gpt-6-sol",
        "summarization": "gpt-6-luna",
        "conflict_resolution": "gpt-6-astra",
    }
)

#: Per-operation overrides, as read from configuration.
ModelOverrides = Mapping[AiOperation, str | None]


class ModelRegistry:
    """Resolves which model serves which operation."""

    __slots__ = ("_models",)

    def __init__(self, models: Mapping[AiOperation, str]) -> None:
        self._models: Mapping[AiOperation, str] = MappingProxyType(dict(models))

    @classmethod
    def create(cls, overrides: ModelOverrides | None = None) -> "ModelRegistry":
        """Build a registry from overrides, falling back to the defaults above.

        Validates every operation up front — including ones with no caller yet
        — so a typo in an unused variable is caught at startup rather than on
        the day that operation is implemented.
        """
        overrides = overrides or {}
        resolved: dict[AiOperation, str] = {}
        problems: list[str] = []

        for operation in AI_OPERATIONS:
            override = overrides.get(operation)
            default = DEFAULT_OPERATION_MODELS[operation]
            value = default if override is None else override.strip()

            if not value:
                problems.append(
                    f"{MODEL_ENV_VARS[operation]} is set but empty. Remove it to use "
                    f"the default ({default}), or give it a model id."
                )
                continue

            # A model id never contains whitespace; catching it here turns a
            # confusing provider 404 into an obvious configuration message.
            if any(character.isspace() for character in value):
                problems.append(
                    f'{MODEL_ENV_VARS[operation]}="{value}" is not a valid model id: '
                    "it contains whitespace."
                )
                continue

            resolved[operation] = value

        if problems:
            listed = "\n".join(f"  - {problem}" for problem in problems)
            raise ModelConfigurationError(f"Invalid model configuration:\n{listed}")

        return cls(resolved)

    def model_for(self, operation: AiOperation) -> str:
        """The model that serves ``operation``."""
        model = self._models.get(operation)

        if not model:
            # Unreachable through `create`, which validates every operation.
            # Guards against a new operation being added to the enum without a
            # default.
            variable = MODEL_ENV_VARS.get(operation, f"OPENAI_MODEL_{operation.upper()}")
            raise ModelConfigurationError(
                f'No model is configured for operation "{operation}". '
                f"Set {variable} or add a default."
            )

        return model

    def describe(self) -> dict[AiOperation, str]:
        """Full routing table. For diagnostics and startup logging."""
        return dict(self._models)
