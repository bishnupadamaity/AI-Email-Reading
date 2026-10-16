"""Pieces shared by the extraction contract and the internal HTTP contract."""

from ai_service.models.base import WireModel


class ValidationIssue(WireModel):
    """One reason an output did not satisfy its contract.

    Mirrors `validationIssueSchema` in `packages/contracts`: the API persists
    these verbatim into `analyses.validation_errors`.
    """

    path: str
    message: str
