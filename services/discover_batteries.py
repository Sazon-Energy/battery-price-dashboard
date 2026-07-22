"""Battery discovery service (GitHub Actions: Mondays).

Port of ``scripts/discover-batteries.js``. Reads enabled + scrape_verified
manufacturers, crawls each catalog page for product URLs, filters by
include/exclude keywords and capacity range, extracts specs + price, and inserts
new rows into ``battery_candidates`` (status ``pending``) for manual review.

    python -m services.discover_batteries
"""

import sys
import time
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from batterydashboard.database import get_supabase_admin
from batterydashboard.discovery_config import load_discovery_config
from batterydashboard.extraction.failure_logger import (
    log_price_extraction_failure,
    normalize_url,
)
from batterydashboard.extraction.llm_extractor import extract_battery_info_with_llm
from batterydashboard.extraction.price_extractor import extract_price_from_html
from batterydashboard.extraction.spec_extractor import (
    clean_product_name,
    extract_capacity,
    extract_power,
)
from batterydashboard.http_client import fetch_page
from batterydashboard.timeutil import now_iso

_SKIP_PATH_SEGMENTS = ("/collections", "/pages", "/blogs", "/cart", "/account")


def extract_product_urls(config, manufacturer):
    """Crawl a manufacturer's catalog page and return candidate product URLs."""
    catalog_url = manufacturer["catalog_url"]
    print("\n🔍 Crawling {} catalog: {}".format(manufacturer["name"], catalog_url))

    try:
        _, html = fetch_page(catalog_url, config["userAgent"], timeout=10.0)
    except Exception as error:  # noqa: BLE001
        print("   ❌ Failed to crawl catalog: {}".format(error))
        return []

    soup = BeautifulSoup(html, "html.parser")
    base = urlsplit(catalog_url)
    base_origin = "{}://{}".format(base.scheme, base.netloc)

    product_urls = []
    seen = set()

    for anchor in soup.select("a[href]"):
        href = anchor.get("href")
        if not href:
            continue

        # Convert relative URLs to absolute.
        if href.startswith("/"):
            href = base_origin + href
        elif not href.startswith("http"):
            continue

        # Only include URLs from the manufacturer's domain.
        try:
            link = urlsplit(href)
            hostname = link.hostname or ""
            if manufacturer["domain"] in hostname:
                path = (link.path or "").lower()
                if not any(segment in path for segment in _SKIP_PATH_SEGMENTS):
                    if href not in seen:
                        seen.add(href)
                        product_urls.append(href)
        except Exception:  # noqa: BLE001 - invalid URL, skip
            pass

    print("   ✓ Found {} potential product URLs".format(len(product_urls)))
    return product_urls


def analyze_battery_product(config, url, manufacturer, llm_budget):
    """Fetch a product page and extract battery specs + price.

    Returns a skip result (``{skipped: True, reason, ...}``) or an analyzed
    result (``{skipped: False, name, extractedSpecs, discoveredPrice, priceMethod}``).
    """
    try:
        _, html = fetch_page(url, config["userAgent"], timeout=10.0)
    except Exception as error:  # noqa: BLE001
        print("   ❌ Error analyzing product: {}".format(error))
        return {"skipped": True, "reason": "error", "error": str(error)}

    soup = BeautifulSoup(html, "html.parser")

    # Extract name: h1 -> title -> og:title.
    heading = soup.find("h1")
    name = heading.get_text().strip() if heading else ""
    if not name:
        title = soup.find("title")
        name = title.get_text().strip() if title else ""
    if not name:
        og_title = soup.select_one('meta[property="og:title"]')
        name = og_title.get("content") if og_title is not None else None
    name = clean_product_name(name)

    description_el = soup.select_one('meta[name="description"]')
    description = (description_el.get("content") if description_el is not None else None) or ""
    og_description_el = soup.select_one('meta[property="og:description"]')
    og_description = (og_description_el.get("content") if og_description_el is not None else None) or ""
    body_text = soup.body.get_text() if soup.body is not None else soup.get_text()

    # Include keywords: check the entire page. Exclude keywords: title + descriptions only.
    include_text = "{} {} {}".format(name or "", description, body_text).lower()
    exclude_text = "{} {} {}".format(name or "", description, og_description).lower()

    matched_include = [kw for kw in manufacturer["include_keywords"] if kw.lower() in include_text]
    if not matched_include:
        return {"skipped": True, "reason": "no_include_keywords"}

    matched_exclude = [kw for kw in manufacturer["exclude_keywords"] if kw.lower() in exclude_text]
    if matched_exclude:
        return {"skipped": True, "reason": "exclude_keywords", "keywords": matched_exclude}

    capacity_result = extract_capacity(body_text, name)
    power_result = extract_power(body_text)
    price_extract = extract_price_from_html(html, url)

    price = price_extract["price"]
    price_method = price_extract["method"]
    capacity_kwh = capacity_result["value"] if capacity_result else None
    power_w = power_result["continuous"]["value"] if power_result["continuous"] else None

    needs_llm_fallback = price is None or capacity_kwh is None or power_w is None

    if needs_llm_fallback and config.get("llmFallbackEnabled") and llm_budget["remaining"] > 0:
        llm_budget["remaining"] -= 1
        llm_result = extract_battery_info_with_llm(body_text, url)

        if llm_result:
            if llm_result.get("is_battery") is False:
                return {"skipped": True, "reason": "llm_classified_not_battery"}
            if price is None and llm_result.get("price") is not None:
                price = llm_result["price"]
                price_method = "LLM fallback (Claude Haiku 4.5)"
            if capacity_kwh is None and llm_result.get("capacity_kwh") is not None:
                capacity_kwh = llm_result["capacity_kwh"]
            if power_w is None and llm_result.get("power_w") is not None:
                power_w = llm_result["power_w"]

    if capacity_kwh is not None and (
        capacity_kwh < manufacturer["min_capacity_kwh"] or capacity_kwh > manufacturer["max_capacity_kwh"]
    ):
        return {"skipped": True, "reason": "capacity_out_of_range", "capacity": capacity_kwh}

    extracted_specs = {}
    if capacity_result:
        extracted_specs["capacity_kwh"] = capacity_result["value"]
        extracted_specs["capacity_source"] = capacity_result["source"]
        extracted_specs["capacity_matched"] = capacity_result["matched"]
        extracted_specs["capacity_priority"] = capacity_result["priority"]
    elif capacity_kwh is not None:
        extracted_specs["capacity_kwh"] = capacity_kwh
        extracted_specs["capacity_source"] = "llm_fallback"

    if power_result["continuous"]:
        extracted_specs["power_w"] = power_result["continuous"]["value"]
        extracted_specs["power_source"] = "body_text"
        extracted_specs["power_matched"] = power_result["continuous"]["matched"]
    elif power_w is not None:
        extracted_specs["power_w"] = power_w
        extracted_specs["power_source"] = "llm_fallback"

    if power_result["peak"]:
        extracted_specs["peak_power_w"] = power_result["peak"]["value"]
        extracted_specs["peak_power_matched"] = power_result["peak"]["matched"]

    return {
        "skipped": False,
        "name": name,
        "extractedSpecs": extracted_specs,
        "discoveredPrice": price,
        "priceMethod": price_method,
    }


def url_already_known(supabase, normalized_url):
    """Return ``{exists, source}`` — checks candidates then batteries tables."""
    candidate = (
        supabase.table("battery_candidates")
        .select("id")
        .eq("normalized_url", normalized_url)
        .limit(1)
        .execute()
    )
    if candidate.data:
        return {"exists": True, "source": "candidate"}

    battery = (
        supabase.table("batteries").select("id").eq("target_url", normalized_url).limit(1).execute()
    )
    if battery.data:
        return {"exists": True, "source": "battery"}

    return {"exists": False, "source": None}


def discover_batteries():
    """Run one discovery pass. Returns an exit code (0 success / 1 fatal)."""
    config = load_discovery_config()

    if not config.get("enabled"):
        print("⏸️  Discovery is disabled in configuration. Exiting.")
        return 0

    supabase = get_supabase_admin()

    print("\n" + "=" * 66)
    print("           Battery Discovery - Production Version")
    print("=" * 66 + "\n")

    # Manufacturers that are enabled AND have a verified price scraper, oldest
    # (or never) searched first, limited to manufacturersPerRun.
    try:
        response = (
            supabase.table("manufacturers")
            .select("*")
            .eq("enabled", True)
            .eq("scrape_verified", True)
            .order("last_searched_at", desc=False, nullsfirst=True)
            .limit(config["manufacturersPerRun"])
            .execute()
        )
    except Exception as error:  # noqa: BLE001
        print("❌ Failed to fetch manufacturers: {}".format(error))
        return 0

    manufacturers = response.data
    if not manufacturers:
        print("⚠️  No enabled+scrape_verified manufacturers found")
        return 0

    print("📋 Found {} enabled+verified manufacturer(s) to process\n".format(len(manufacturers)))

    total_candidates_created = 0
    llm_budget = {"remaining": config.get("llmFallbackMaxCallsPerRun", 0) or 0}

    for manufacturer in manufacturers:
        print("\n" + "=" * 70)
        print("Processing: {}".format(manufacturer["name"]))
        print("=" * 70)

        start_time = time.monotonic()

        product_urls = extract_product_urls(config, manufacturer)

        if not product_urls:
            print("⚠️  No product URLs found")
            supabase.table("manufacturers").update(
                {"last_searched_at": now_iso(), "last_products_found": 0}
            ).eq("id", manufacturer["id"]).execute()
            continue

        candidates_created = 0
        products_analyzed = 0

        for url in product_urls:
            if total_candidates_created >= config["maxCandidatesPerRun"]:
                print(
                    "\n⏸️  Reached maximum candidates per run ({})".format(config["maxCandidatesPerRun"])
                )
                break

            products_analyzed += 1
            normalized_url = normalize_url(url)

            known_check = url_already_known(supabase, normalized_url)
            if known_check["exists"]:
                print("   ⏭️  Already known ({}): {}".format(known_check["source"], normalized_url))
                continue

            print("\n[{}] Analyzing: {}".format(products_analyzed, url))

            result = analyze_battery_product(config, url, manufacturer, llm_budget)

            if result["skipped"]:
                print("   ⏭️  Skipped: {}".format(result["reason"]))
            elif not result["discoveredPrice"]:
                # Battery product confirmed, but no price found - log the failure.
                print("   ⚠️  No price extracted for {} - logging failure".format(result["name"]))
                log_price_extraction_failure(
                    supabase,
                    url=url,
                    normalized_url=normalized_url,
                    manufacturer_id=manufacturer["id"],
                    product_name=result["name"],
                    extracted_specs=result["extractedSpecs"],
                    reason="no_price_extracted",
                )
            else:
                try:
                    supabase.table("battery_candidates").insert(
                        {
                            "url": url,
                            "normalized_url": normalized_url,
                            "name": result["name"],
                            "manufacturer_id": manufacturer["id"],
                            "extracted_specs": result["extractedSpecs"],
                            "discovered_price": result["discoveredPrice"],
                            "status": "pending",
                        }
                    ).execute()
                    candidates_created += 1
                    total_candidates_created += 1
                    print(
                        "   ✅ Created candidate: {} (${} via {})".format(
                            result["name"], result["discoveredPrice"], result["priceMethod"]
                        )
                    )
                except Exception as insert_error:  # noqa: BLE001
                    print("   ❌ Failed to create candidate: {}".format(insert_error))

            time.sleep(config["crawlDelayMs"] / 1000)

        try:
            supabase.table("manufacturers").update(
                {"last_searched_at": now_iso(), "last_products_found": candidates_created}
            ).eq("id", manufacturer["id"]).execute()
        except Exception as update_error:  # noqa: BLE001
            print("\n⚠️  Failed to update manufacturer metadata: {}".format(update_error))

        duration = time.monotonic() - start_time
        print(
            "\n✅ {} complete: {} candidates created in {:.1f}s".format(
                manufacturer["name"], candidates_created, duration
            )
        )

    print("\n" + "=" * 66)
    print("  Discovery Complete: {} total candidates created".format(total_candidates_created))
    print("=" * 66 + "\n")
    return 0


def _main():
    try:
        return discover_batteries()
    except Exception as error:  # noqa: BLE001
        print("💥 Fatal error: {}".format(error))
        return 1


if __name__ == "__main__":
    sys.exit(_main())
