"""Per-battery price scraper (imported by ``update_all_prices``).

Port of ``scripts/scrape-battery.js``. Fetches one battery's ``target_url``,
runs deterministic price extraction, and — if that fails and the LLM budget
allows — falls back to Claude Haiku. Returns a result dict; never raises for a
scrape failure (only for an unresolvable battery lookup).
"""

from bs4 import BeautifulSoup

from batterydashboard.database import get_supabase
from batterydashboard.discovery_config import load_llm_fallback_config
from batterydashboard.extraction.llm_extractor import extract_battery_info_with_llm
from batterydashboard.extraction.price_extractor import extract_price_from_html
from batterydashboard.http_client import fetch_page
from batterydashboard.timeutil import now_iso

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
)

# LLM fallback budget - one per process (i.e. per `python -m services.update_all_prices`
# run). Loaded lazily so a missing/malformed config file doesn't crash scraping.
_LLM_FALLBACK = load_llm_fallback_config()
_llm_budget = {"remaining": _LLM_FALLBACK["max_calls_per_run"]}


def scrape_price(battery_id):
    """Return ``{success, price, method, url, scraped_at}`` or ``{success: False, error, ...}``."""
    if not battery_id:
        raise ValueError("Battery ID is required")

    supabase = get_supabase()
    try:
        response = (
            supabase.table("batteries")
            .select("name, target_url")
            .eq("id", battery_id)
            .single()
            .execute()
        )
    except Exception as error:  # noqa: BLE001
        raise RuntimeError("Failed to fetch battery: {}".format(error))

    data = response.data
    if not data:
        raise RuntimeError("Battery with ID {} not found in database".format(battery_id))

    battery_name = data["name"]
    url = data["target_url"]

    try:
        print("🔍 Starting {} scraping...".format(battery_name))
        print("📡 Fetching {} webpage...".format(battery_name))

        status_code, html = fetch_page(url, _USER_AGENT, timeout=10.0)
        print("✅ {} page fetched successfully ({})".format(battery_name, status_code))

        extracted = extract_price_from_html(html, url)
        price = extracted["price"]
        method = extracted["method"]

        if price:
            print("💰 Extracted {} price: ${} (via {})".format(battery_name, price, method))
            return {
                "success": True,
                "price": price,
                "method": method,
                "url": url,
                "scraped_at": now_iso(),
            }

        # Deterministic extraction failed - try the LLM fallback before giving up.
        if _LLM_FALLBACK["enabled"] and _llm_budget["remaining"] > 0:
            _llm_budget["remaining"] -= 1
            soup = BeautifulSoup(html, "html.parser")
            body_text = soup.body.get_text() if soup.body is not None else soup.get_text()
            llm_result = extract_battery_info_with_llm(body_text, url)

            if llm_result and llm_result.get("price") is not None:
                print(
                    "💰 Extracted {} price via LLM fallback: ${}".format(
                        battery_name, llm_result["price"]
                    )
                )
                return {
                    "success": True,
                    "price": llm_result["price"],
                    "method": "LLM fallback (Claude Haiku 4.5)",
                    "url": url,
                    "scraped_at": now_iso(),
                }

        print("❌ No price found for {} at {}".format(battery_name, url))
        return {"success": False, "error": "Price not found with any method", "url": url}
    except Exception as error:  # noqa: BLE001 - mirror JS: scrape failures return a dict
        print("❌ {} scraping failed: {}".format(battery_name, error))
        return {"success": False, "error": str(error)}
