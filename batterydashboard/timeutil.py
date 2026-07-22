"""Timestamp helper matching the previous ``new Date().toISOString()`` output."""

from datetime import datetime, timezone


def now_iso():
    """Return the current UTC time as an ISO-8601 string ending in ``Z``.

    e.g. ``2026-07-21T15:04:05.123Z`` — the same shape JavaScript's
    ``toISOString()`` produced, which Postgres ``timestamptz`` columns accept.
    """
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
