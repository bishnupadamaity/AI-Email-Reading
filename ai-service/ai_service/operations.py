"""The AI operations this service routes to models.

Mirrors `AI_OPERATIONS` in `packages/contracts/src/ai-operations.ts`, which is
the shared routing vocabulary for the whole platform. Implementation status is
deliberately *not* encoded here: this list says what can be routed, not that
every operation has a caller. Today only ``extraction`` is implemented — see
`docs/architecture.md`.
"""

from typing import Literal, get_args

AiOperation = Literal[
    "classification",
    "extraction",
    "summarization",
    "conflict_resolution",
]

#: Every declared operation, in the same order as the TypeScript contract.
AI_OPERATIONS: tuple[AiOperation, ...] = get_args(AiOperation)

#: Operations with a caller today. The rest are configured and validated at
#: startup so a typo fails loudly, but nothing invokes them.
IMPLEMENTED_OPERATIONS: frozenset[AiOperation] = frozenset({"extraction"})
