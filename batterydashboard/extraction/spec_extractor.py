"""Capacity / power / product-name extraction for the discovery service.

Ported from the inline helpers in ``scripts/discover-batteries.js``
(``extractCapacity``, ``extractPower``, ``cleanProductName``).
"""

import re

_LEADING_NUMBER = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)")


def _parse_float_prefix(value):
    """Mimic JavaScript ``parseFloat`` (parse a leading numeric prefix)."""
    if value is None:
        return None
    match = _LEADING_NUMBER.match(str(value).strip())
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _to_fixed3(value):
    """Round to 3 decimals like JS ``Number(value.toFixed(3))``."""
    return float("{:.3f}".format(value))


# Body-text capacity patterns, in descending priority. ``(regex, multiplier, priority)``.
_CAPACITY_BODY_PATTERNS = [
    (re.compile(r"Battery Capacity[:\s]+([\d.]+)\s*kWh", re.IGNORECASE), 1, 10),
    (re.compile(r"Capacity[:\s]+([\d.]+)\s*kWh", re.IGNORECASE), 1, 9),
    (re.compile(r"(\d{4,5})Wh", re.IGNORECASE), 0.001, 7),
    (re.compile(r"\(([\d,]+)Wh\)", re.IGNORECASE), 0.001, 5),
    (re.compile(r"([\d.]+)\s*kWh", re.IGNORECASE), 1, 4),
]

_CAPACITY_NAME_PATTERN = re.compile(r"([\d,]+)Wh", re.IGNORECASE)


def extract_capacity(text, product_name):
    """Return the best capacity match ``{value, matched, priority, source}`` or None."""
    found_capacities = []

    # HIGHEST PRIORITY: extract from the product name first.
    if product_name:
        for match in _CAPACITY_NAME_PATTERN.finditer(product_name):
            number = match.group(1).replace(",", "")
            parsed = _parse_float_prefix(number)
            if parsed is None:
                continue
            value = parsed * 0.001  # Wh -> kWh
            if 1 <= value <= 15:
                found_capacities.append(
                    {
                        "value": _to_fixed3(value),
                        "matched": match.group(0),
                        "priority": 100,
                        "source": "product_name",
                    }
                )

        if found_capacities:
            return found_capacities[0]

    # LOWER PRIORITY: body-text patterns.
    for pattern, multiplier, priority in _CAPACITY_BODY_PATTERNS:
        for match in pattern.finditer(text):
            number = match.group(1).replace(",", "")
            parsed = _parse_float_prefix(number)
            if parsed is None:
                continue
            value = parsed * multiplier
            if 1 <= value <= 15:
                found_capacities.append(
                    {
                        "value": _to_fixed3(value),
                        "matched": match.group(0),
                        "priority": priority,
                        "source": "body_text",
                    }
                )

    if not found_capacities:
        return None

    # Sort by priority (highest first), then by value (lowest first).
    found_capacities.sort(key=lambda entry: (-entry["priority"], entry["value"]))
    return found_capacities[0]


# Power patterns: ``(regex, type, priority)``.
_POWER_PATTERNS = [
    (re.compile(r"(?:continuous|rated|AC\s+output)[:\s]+(\d+\.?\d*)\s*[kK]?W", re.IGNORECASE), "continuous", 10),
    (re.compile(r"(\d+\.?\d*)\s*[kK]?W\s+(?:continuous|rated)", re.IGNORECASE), "continuous", 10),
    (re.compile(r"AC\s+Output[:\s]+(\d+)W", re.IGNORECASE), "continuous", 8),
    (re.compile(r"Output[:\s]+(\d+)W", re.IGNORECASE), "continuous", 5),
    (re.compile(r"(?:surge|peak|max|starting)[:\s]+(\d+\.?\d*)\s*[kK]?W", re.IGNORECASE), "peak", 10),
    (re.compile(r"(\d+\.?\d*)\s*[kK]?W\s+(?:surge|peak|max|starting)", re.IGNORECASE), "peak", 10),
]


def extract_power(text):
    """Return ``{"continuous": {value, matched}|None, "peak": {value, matched}|None}``."""
    found_powers = []

    for pattern, power_type, priority in _POWER_PATTERNS:
        for match in pattern.finditer(text):
            parsed = _parse_float_prefix(match.group(1))
            if parsed is None:
                continue
            value = parsed
            if "kw" in match.group(0).lower():
                value *= 1000
            if 100 <= value <= 10000:
                found_powers.append(
                    {"value": value, "type": power_type, "matched": match.group(0), "priority": priority}
                )

    if not found_powers:
        return {"continuous": None, "peak": None}

    continuous_powers = sorted(
        [p for p in found_powers if p["type"] == "continuous"],
        key=lambda p: -p["priority"],
    )
    peak_powers = sorted(
        [p for p in found_powers if p["type"] == "peak"],
        key=lambda p: -p["priority"],
    )

    continuous = continuous_powers[0] if continuous_powers else None
    peak = peak_powers[0] if peak_powers else None

    # Validation: peak should be >= continuous; swap if not.
    if continuous and peak and peak["value"] < continuous["value"]:
        continuous, peak = peak, continuous

    return {
        "continuous": {"value": continuous["value"], "matched": continuous["matched"]} if continuous else None,
        "peak": {"value": peak["value"], "matched": peak["matched"]} if peak else None,
    }


def clean_product_name(name):
    """Collapse whitespace and drop duplicate lines from a raw product name."""
    if not name:
        return None
    lines = [line.strip() for line in name.split("\n")]
    lines = [line for line in lines if len(line) > 0]
    unique_lines = list(dict.fromkeys(lines))
    cleaned = unique_lines[0] if unique_lines else name
    return re.sub(r"\s+", " ", cleaned).strip()
