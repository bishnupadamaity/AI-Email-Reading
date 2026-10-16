"""Small helpers with no dependencies of their own."""

import time
from datetime import UTC, datetime


def monotonic_ms() -> int:
    """Elapsed-time clock in milliseconds.

    Monotonic on purpose: latency must not go negative because the wall clock
    was adjusted mid-request.
    """
    return time.monotonic_ns() // 1_000_000


def utc_now_iso() -> str:
    """Current time as an ISO-8601 timestamp with an offset.

    The offset is not optional: `isoTimestampSchema` in `packages/contracts`
    requires one, and the API validates this value against it.
    """
    return datetime.now(UTC).isoformat()
