"""Timestamp helpers: ISO-8601 output matching ``new Date().toISOString()`` and lenient parsing."""

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


def parse_iso(timestamp):
    """Parse a Postgres/ISO-8601 timestamp string into a ``datetime``.

    Returns ``None`` for empty or unparseable values.
    """
    if not timestamp:
        return None
    text = str(timestamp).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        try:
            return datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return None
