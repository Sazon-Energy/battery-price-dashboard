"""Fallback extraction/classification via Claude Haiku 4.5.

A port of ``lib/llm-extractor.js``. Used only when the deterministic
regex/CSS-selector extraction fails or is incomplete. Returns ``None`` — never
raises — if ``ANTHROPIC_API_KEY`` isn't configured or the call fails, so callers
fall back to the existing failure-logging behavior instead of crashing the run.

Implementation note: the Node version used ``messages.parse()`` with a JSON
schema. Here we get the same structured object via a single forced tool call,
which yields identical ``{is_battery, name, price, capacity_kwh, power_w}`` output
and is stable across anthropic-sdk versions.
"""

import anthropic

from .. import config

_MODEL = "claude-haiku-4-5"
_MAX_PAGE_TEXT_CHARS = 8000

_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "is_battery": {
            "type": "boolean",
            "description": (
                "Whether this product page is for a home battery, portable power "
                "station, or similar battery product (not an accessory, unrelated "
                "product, or bundle of unrelated items)."
            ),
        },
        "name": {
            "type": "string",
            "description": (
                "Clean product name, with promotional suffixes (e.g. \"Flash Sale\", "
                "\"Livestream Deal\") and unrelated bundle add-ons removed."
            ),
        },
        "price": {
            "type": ["number", "null"],
            "description": "Current price of the product in USD, or null if it cannot be determined.",
        },
        "capacity_kwh": {
            "type": ["number", "null"],
            "description": "Battery capacity in kWh, or null if not stated on the page.",
        },
        "power_w": {
            "type": ["number", "null"],
            "description": "Continuous output power in watts, or null if not stated on the page.",
        },
    },
    "required": ["is_battery", "name", "price", "capacity_kwh", "power_w"],
    "additionalProperties": False,
}

_EXTRACTION_TOOL = {
    "name": "record_battery_info",
    "description": "Record the structured battery product data extracted from the page.",
    "input_schema": _EXTRACTION_SCHEMA,
}

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not config.ANTHROPIC_API_KEY:
        return None
    _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


def extract_battery_info_with_llm(page_text, url):
    """Return the extracted dict, or ``None`` if the LLM is unavailable/fails."""
    client = _get_client()
    if client is None:
        print("   ⚠️  ANTHROPIC_API_KEY not set - skipping LLM fallback")
        return None

    try:
        response = client.messages.create(
            model=_MODEL,
            max_tokens=1024,
            tools=[_EXTRACTION_TOOL],
            tool_choice={"type": "tool", "name": "record_battery_info"},
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Extract structured data about the product on this page. "
                        "URL: {}\n\nPage text:\n{}".format(
                            url, page_text[:_MAX_PAGE_TEXT_CHARS]
                        )
                    ),
                }
            ],
        )

        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "record_battery_info":
                return block.input
        return None
    except Exception as error:  # noqa: BLE001 - mirror JS "never throw" contract
        print("   ⚠️  LLM fallback failed: {}".format(error))
        return None
