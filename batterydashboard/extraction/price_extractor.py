"""Extract a price from product-page HTML using a series of fallback methods.

A faithful port of ``lib/price-extractor.js``. Methods are tried in order and the
first match wins:

  1. JSON-LD structured data (most reliable)
  2. Meta tags (og:price:amount, product:price:amount)
  3. data-product-price attributes
  4. Common CSS price selectors (Shopify, Anker, generic e-commerce)
  5. Inline JavaScript (variant-specific data, product data blobs)

Used by both ``services/scrape_battery.py`` (price refresh) and
``services/discover_batteries.py`` (capture price at discovery time).
"""

import json
import re

from bs4 import BeautifulSoup

# Parses a leading numeric prefix like JavaScript's ``parseFloat`` (ignoring
# trailing characters), matching the Node implementation's behavior exactly.
_LEADING_NUMBER = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)")

# Method 5 patterns.
_VARIANT_PATTERN_LABELLED = re.compile(
    r'"(?:price|salePrice|discountPrice|amount|currentPrice|finalPrice|specialPrice|compareAtPrice)"[:\s]*(\d+\.?\d*)',
    re.IGNORECASE,
)
_VARIANT_PATTERN_BARE = re.compile(r"[:,]\s*(\d{3,4}(?:\.\d{2})?)\s*[,}]")
_PRODUCT_BLOB_PATTERN = re.compile(
    r"(?:window\.|var\s+|const\s+|let\s+)"
    r"(?:__INITIAL_STATE__|__PRELOADED_STATE__|PRODUCT_DATA|productData)"
    r"\s*=\s*(\{.*?\});",
    re.DOTALL,
)
_INLINE_SALE_PATTERN = re.compile(
    r"\"(?:salePrice|discountPrice|currentPrice|finalPrice)[\"']?\s*:\s*[\"']?\$?([\d,]+\.?\d*)",
    re.IGNORECASE,
)
_INLINE_REGULAR_PATTERN = re.compile(
    r"\"(?:price|regularPrice|listPrice)[\"']?\s*:\s*[\"']?\$?([\d,]+\.?\d*)",
    re.IGNORECASE,
)

_METHOD_4_SELECTORS = [
    'span[class*="codePrice"]',
    '[class*="ProductTag"][class*="price"]',
    '[class*="salePrice"]',
    '[class*="discountPrice"]',
    ".price-item--regular .price",
    ".product-form__price .price",
    ".price__regular .price",
    "span.money",
    ".product-price .money",
    '[class*="price"][class*="regular"]',
    ".shopify-price",
    '[class*="currentPrice"]',
    '[class*="finalPrice"]',
]
_METHOD_4_SALE_PATTERNS = [
    "codePrice",
    "salePrice",
    "discountPrice",
    "currentPrice",
    "finalPrice",
]

_SALE_PRICE_FIELDS = [
    "salePrice",
    "discountPrice",
    "discountedPrice",
    "specialPrice",
    "currentPrice",
    "finalPrice",
]
_REGULAR_PRICE_FIELDS = [
    "price",
    "regularPrice",
    "listPrice",
    "amount",
    "priceAmount",
    "value",
]


def _parse_float_prefix(value):
    """Mimic JavaScript ``parseFloat``: parse a leading numeric prefix and
    return ``None`` where JS would return ``NaN``."""
    if value is None:
        return None
    match = _LEADING_NUMBER.match(str(value).strip())
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _script_text(element):
    """Return the raw inner text of a <script> element (cheerio ``.html()``)."""
    if element.string is not None:
        return element.string
    return element.get_text()


def extract_price_from_html(html, url):
    """Return ``{"price": float|None, "method": str|None}`` for the given page."""
    soup = BeautifulSoup(html or "", "html.parser")
    price = None
    found_method = None

    # Method 1: JSON-LD structured data
    for element in soup.select('script[type="application/ld+json"]'):
        raw = _script_text(element)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            continue
        if isinstance(data, dict) and data.get("@type") == "Product" and data.get("offers"):
            offers = data["offers"]
            if isinstance(offers, list):
                offers = offers[0] if offers else None
            if isinstance(offers, dict) and offers.get("price"):
                price = _parse_float_prefix(str(offers["price"]).replace(",", ""))
                found_method = "JSON-LD structured data"
                break

    # Method 2: Meta tags
    if not price:
        element = soup.select_one(
            'meta[property="product:price:amount"], meta[property="og:price:amount"]'
        )
        meta_price = element.get("content") if element is not None else None
        if meta_price:
            price = _parse_float_prefix(meta_price)
            found_method = "Meta tag"

    # Method 3: data attributes
    if not price:
        element = soup.select_one("[data-product-price]")
        data_price = element.get("data-product-price") if element is not None else None
        if data_price:
            match = re.search(r"[\d.]+", data_price)
            if match:
                price = _parse_float_prefix(match.group(0))
                found_method = "Data attribute"

    # Method 4: Common price selectors (Shopify, Anker, generic)
    if not price:
        found_prices = []
        for selector in _METHOD_4_SELECTORS:
            for element in soup.select(selector):
                price_text = element.get_text().strip()
                match = re.search(r"[\d,]+\.?\d*", price_text)
                if not match:
                    continue
                extracted_price = _parse_float_prefix(match.group(0).replace(",", ""))
                if extracted_price is not None and 100 < extracted_price < 10000:
                    is_sale = any(
                        pattern.lower() in selector.lower()
                        for pattern in _METHOD_4_SALE_PATTERNS
                    )
                    found_prices.append(
                        {"price": extracted_price, "selector": selector, "is_sale": is_sale}
                    )

        if found_prices:
            sale_prices = [entry for entry in found_prices if entry["is_sale"]]
            pool = sale_prices if sale_prices else found_prices
            selected = pool[0]
            for candidate in pool[1:]:
                if candidate["price"] < selected["price"]:
                    selected = candidate
            price = selected["price"]
            found_method = "CSS selector: {}".format(selected["selector"])

    # Method 5: Inline JavaScript (variant-specific and product data)
    if not price:
        variant_match = re.search(r"[?&]variant=(\d+)", url) if url else None
        variant_id = variant_match.group(1) if variant_match else None
        found_prices = []

        for element in soup.select("script:not([src])"):
            script_content = _script_text(element)
            if not script_content:
                continue

            # Variant-specific price scan
            if variant_id:
                variant_index = script_content.find(variant_id)
                while variant_index != -1:
                    context_start = max(0, variant_index - 500)
                    context_end = min(len(script_content), variant_index + 500)
                    context = script_content[context_start:context_end]

                    variant_prices = []
                    for pattern in (_VARIANT_PATTERN_LABELLED, _VARIANT_PATTERN_BARE):
                        for match in pattern.finditer(context):
                            price_value = _parse_float_prefix(match.group(1))
                            if price_value is None:
                                continue
                            potential_price = (
                                price_value / 100 if price_value > 10000 else price_value
                            )
                            if 100 < potential_price < 10000:
                                variant_prices.append(potential_price)

                    for unique_price in dict.fromkeys(variant_prices):
                        found_prices.append({"price": unique_price, "type": "variant-context"})

                    variant_index = script_content.find(
                        variant_id, variant_index + len(variant_id)
                    )

            # Product data blob scan
            blob_match = _PRODUCT_BLOB_PATTERN.search(script_content)
            if blob_match:
                try:
                    blob_data = json.loads(blob_match.group(1))
                    _find_all_prices_in_object(blob_data, found_prices)
                except (ValueError, TypeError):
                    pass

            # Inline price patterns (index 0 is the sale pattern)
            for index, pattern in enumerate((_INLINE_SALE_PATTERN, _INLINE_REGULAR_PATTERN)):
                is_sale_pattern = index == 0
                for match in pattern.finditer(script_content):
                    if not match.group(1):
                        continue
                    price_value = _parse_float_prefix(match.group(1).replace(",", ""))
                    if price_value is None:
                        continue
                    potential_price = price_value / 100 if price_value > 10000 else price_value
                    if 100 < potential_price < 10000:
                        found_prices.append(
                            {
                                "price": potential_price,
                                "type": "sale" if is_sale_pattern else "regular",
                            }
                        )

        variant_context_prices = [p for p in found_prices if p["type"] == "variant-context"]
        sale_prices = [p for p in found_prices if p["type"] == "sale"]
        regular_prices = [p for p in found_prices if p["type"] == "regular"]

        if variant_context_prices:
            price = min(p["price"] for p in variant_context_prices)
            found_method = "Inline JavaScript (variant-specific)"
        elif sale_prices:
            price = min(p["price"] for p in sale_prices)
            found_method = "Inline JavaScript (sale price)"
        elif regular_prices:
            price = regular_prices[0]["price"]
            found_method = "Inline JavaScript (regular price)"

    return {"price": price, "method": found_method}


def _find_all_prices_in_object(obj, found_prices):
    """Recursively collect in-range prices from a parsed product-data object."""
    if isinstance(obj, list):
        for item in obj:
            _find_all_prices_in_object(item, found_prices)
        return
    if not isinstance(obj, dict):
        return

    for field in _SALE_PRICE_FIELDS:
        if obj.get(field):
            value = _parse_price_field(obj[field])
            if value is not None and 100 < value < 10000:
                found_prices.append({"price": value, "type": "sale"})

    for field in _REGULAR_PRICE_FIELDS:
        if obj.get(field):
            value = _parse_price_field(obj[field])
            if value is not None and 100 < value < 10000:
                found_prices.append({"price": value, "type": "regular"})

    for value in obj.values():
        if isinstance(value, (dict, list)):
            _find_all_prices_in_object(value, found_prices)


def _parse_price_field(field):
    """Coerce a JSON price field (number or string) to a float, with the same
    cents-normalization (>10000 -> /100) the Node version applies."""
    if isinstance(field, bool):
        return None
    if isinstance(field, (int, float)):
        return field / 100 if field > 10000 else field
    if isinstance(field, str):
        cleaned = re.sub(r"[^0-9.]", "", field)
        parsed = _parse_float_prefix(cleaned)
        if parsed is not None:
            return parsed / 100 if parsed > 10000 else parsed
    return None
