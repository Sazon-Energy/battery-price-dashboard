"""Record price-extraction failures.

A port of ``lib/failure-logger.js``. Shared between the discovery service (page
found but no price at discovery time) and the price-refresh service (refresh
failed for an already-tracked battery), so failures from either path are visible
in one place.
"""

from urllib.parse import urlsplit


def normalize_url(url):
    """Strip query parameters and fragments, keeping ``origin + pathname``.

    Mirrors ``new URL(url).origin + urlObj.pathname`` and falls back to the raw
    url when it cannot be parsed.
    """
    try:
        parts = urlsplit(url)
        if not parts.scheme or not parts.netloc:
            return url
        return "{}://{}{}".format(parts.scheme, parts.netloc, parts.path)
    except (ValueError, TypeError):
        return url


def log_price_extraction_failure(
    admin_client,
    *,
    url,
    normalized_url,
    reason,
    manufacturer_id=None,
    product_name=None,
    extracted_specs=None,
):
    """Insert a row into ``price_extraction_failures``.

    ``admin_client`` must be a service-role client; the table's row-level
    security has no policies. Never raises — logs a warning on failure, matching
    the Node behavior.
    """
    if extracted_specs is None:
        extracted_specs = {}
    try:
        admin_client.table("price_extraction_failures").insert(
            {
                "url": url,
                "normalized_url": normalized_url,
                "manufacturer_id": manufacturer_id,
                "product_name": product_name,
                "extracted_specs": extracted_specs,
                "failure_reason": reason,
            }
        ).execute()
    except Exception as error:  # noqa: BLE001 - mirror JS "never throw" contract
        print("   ⚠️  Failed to log price failure: {}".format(error))
