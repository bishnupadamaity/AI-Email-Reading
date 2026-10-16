"""Business-email extraction contract.

The Python mirror of `shipmentExtractionSchema` in
`packages/contracts/src/extraction.ts`, which stays the source of truth for the
API's responses and the `analyses.extracted_data` column. These models serve
three jobs at once: they build the strict JSON Schema for OpenAI Structured
Outputs, they validate what the model returns, and they serialise the result
onto the internal HTTP response in the contract's camelCase.

Two rules shape every field below:

1. **Absence is explicit.** Every field is required but nullable — ``None``
   means "not stated in this email". Nothing is inferred or guessed, and
   required-but-nullable is also what constrained decoding handles best.
2. **Values carry their evidence.** Each extracted value travels with the
   verbatim span it came from, so a reviewer can check the model's work
   without re-reading the message.

Shared fixtures in `test/fixtures/extraction/` are validated against both these
models and the Zod schemas, so the two cannot drift apart silently.
"""

from typing import Literal, get_args

from ai_service.models.base import WireModel

#: What kind of business email this is.
EmailClassification = Literal[
    "shipment_booking",
    "shipment_update",
    "arrival_notice",
    "quote_request",
    "invoice",
    "customs_document",
    "general_inquiry",
    "other",
]

EMAIL_CLASSIFICATIONS: tuple[EmailClassification, ...] = get_args(EmailClassification)


class EvidencedValue(WireModel):
    """An extracted value together with the text it was read from.

    ``evidence`` is a verbatim span of the email. It is never logged — only
    persisted — because it reproduces message content.
    """

    value: str | None
    evidence: str | None


class EvidencedDate(WireModel):
    """A date exactly as the email expressed it, normalised to ``YYYY-MM-DD``
    when unambiguous.

    A plain string rather than a strict date type, deliberately: real emails
    say "mid-March" or "week 12", and rejecting those would discard
    information the reviewer needs. This is the representation the TypeScript
    contract already uses, and it is preserved exactly.
    """

    value: str | None
    evidence: str | None


class MissingField(WireModel):
    """A field the email should have carried for its classification, but did
    not."""

    field: str
    reason: str | None


class Conflict(WireModel):
    """Two or more incompatible values for the same field within one email.

    Recorded rather than resolved: picking a winner is a business decision, and
    a conflict is precisely what should reach a human reviewer.
    """

    field: str
    values: list[str]
    note: str | None


class ShipmentExtraction(WireModel):
    """Structured result of analysing one business email."""

    classification: EmailClassification
    #: One sentence, drawn from the email; no speculation.
    summary: str

    supplier_organization: EvidencedValue
    shipment_reference: EvidencedValue
    origin_port: EvidencedValue
    destination_port: EvidencedValue
    container_number: EvidencedValue
    bill_of_lading_number: EvidencedValue
    shipping_line: EvidencedValue
    vessel_name: EvidencedValue
    voyage_number: EvidencedValue
    estimated_departure: EvidencedDate
    estimated_arrival: EvidencedDate
    #: Demurrage/detention free time, as stated (e.g. "14 days at destination").
    free_time: EvidencedValue

    missing_fields: list[MissingField]
    conflicts: list[Conflict]


#: Attributes shaped ``{ value, evidence }``, in contract order.
#:
#: Derived from the model rather than hand-listed, so adding an evidenced field
#: cannot leave the integrity check behind.
EVIDENCED_ATTRIBUTES: tuple[str, ...] = tuple(
    name
    for name, field in ShipmentExtraction.model_fields.items()
    if field.annotation in (EvidencedValue, EvidencedDate)
)


def contract_name(attribute: str) -> str:
    """The contract's name for a Python attribute (``free_time`` → ``freeTime``).

    Issue paths and conflict/missing-field names use contract names, so a
    reviewer reading `validationErrors` sees the same field names the API
    returns.
    """
    field = ShipmentExtraction.model_fields.get(attribute)
    if field is None or field.alias is None:
        return attribute
    return field.alias


def attribute_for(contract_field: str) -> str | None:
    """Reverse of :func:`contract_name`; ``None`` when no such field exists."""
    for name, field in ShipmentExtraction.model_fields.items():
        if contract_field in (field.alias, name):
            return name
    return None


#: Contract names of the evidenced fields. What `conflicts[].field` and
#: `missingFields[].field` are allowed to contain.
EVIDENCED_FIELDS: tuple[str, ...] = tuple(contract_name(a) for a in EVIDENCED_ATTRIBUTES)
