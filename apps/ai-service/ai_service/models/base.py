"""Shared Pydantic configuration for everything on the wire.

The platform's contract is camelCase (`packages/contracts`, the API's JSON
responses, and the `extracted_data` column that stores an extraction verbatim).
Python attributes stay snake_case and carry camelCase aliases, so one
definition serves both: `model_dump()` emits the contract's names and
`model_validate()` accepts them.

`extra="forbid"` matters beyond tidiness: the same models build the strict JSON
Schema sent to OpenAI Structured Outputs, where `additionalProperties: false`
is required — and it means an unexpected key is a validation failure rather
than silently dropped data.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class WireModel(BaseModel):
    """Base for every model that crosses a process boundary."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
    )
