"""Batch price-refresh service (GitHub Actions: Sun & Wed).

Port of ``scripts/update-all-prices.js``. Scrapes each tracked battery, updates
``current_price``, and appends a ``price_history`` row. Individual dead-URL
failures are logged to ``price_extraction_failures`` and tolerated; the run only
exits non-zero when nothing succeeds (e.g. DB down / bad credentials).

    python -m services.update_all_prices           # refresh all batteries
    python -m services.update_all_prices <battery_id>   # refresh one battery
"""

import sys
import time

from batterydashboard.database import get_supabase_admin
from batterydashboard.extraction.failure_logger import (
    log_price_extraction_failure,
    normalize_url,
)
from batterydashboard.timeutil import now_iso
from services.scrape_battery import scrape_price


def update_battery_price(battery):
    """Scrape, update ``current_price``, and append to ``price_history`` for one battery."""
    battery_id = battery["id"]
    battery_name = battery["name"]
    target_url = battery.get("target_url")

    print("\n🚀 Starting price update for {}...".format(battery_name))

    # Step 1: scrape the price using the generic scraper.
    scrape_result = scrape_price(battery_id)

    admin = get_supabase_admin()

    if not scrape_result["success"]:
        error = scrape_result.get("error")
        print("❌ {} scraping failed: {}".format(battery_name, error))
        # Log to price_extraction_failures so price-update failures are visible
        # the same way discovery failures already are.
        log_price_extraction_failure(
            admin,
            url=target_url,
            normalized_url=normalize_url(target_url),
            product_name=battery_name,
            reason=error or "price_update_failed",
        )
        return {"success": False, "battery_id": battery_id, "battery_name": battery_name, "error": error}

    print("💰 {} scraped price: ${}".format(battery_name, scrape_result["price"]))

    # Step 2: current price for comparison.
    current_price = battery.get("current_price")
    print("📋 Current price in database: ${}".format(current_price if current_price is not None else "none"))

    # Step 3: update the price.
    try:
        updated = (
            admin.table("batteries")
            .update({"current_price": scrape_result["price"], "updated_at": now_iso()})
            .eq("id", battery_id)
            .execute()
        )
    except Exception as update_error:  # noqa: BLE001
        print("❌ {} price update failed: {}".format(battery_name, update_error))
        return {"success": False, "battery_id": battery_id, "battery_name": battery_name, "error": str(update_error)}

    updated_battery = updated.data[0] if updated.data else None

    # Step 4: add to price history.
    try:
        admin.table("price_history").insert(
            [{"battery_id": battery_id, "price": scrape_result["price"], "scraped_at": scrape_result["scraped_at"]}]
        ).execute()
    except Exception as history_error:  # noqa: BLE001
        print("⚠️ {} price history update failed: {}".format(battery_name, history_error))

    price_change = (scrape_result["price"] - current_price) if current_price else None
    change_suffix = ""
    if price_change:
        change_suffix = " ({}${:.2f})".format("+" if price_change >= 0 else "-", abs(price_change))
    print("✅ {}: Updated to ${}{}".format(battery_name, scrape_result["price"], change_suffix))

    return {
        "success": True,
        "battery_id": battery_id,
        "battery_name": battery_name,
        "battery": updated_battery,
        "old_price": current_price,
        "new_price": scrape_result["price"],
        "price_change": price_change,
    }


def update_all_prices():
    """Refresh prices for every battery in the database."""
    print("🔄 Starting batch price update for all batteries...\n")

    admin = get_supabase_admin()

    print("📥 Fetching all batteries from database...")
    try:
        response = (
            admin.table("batteries")
            .select("id, name, current_price, target_url")
            .order("name")
            .execute()
        )
    except Exception as fetch_error:  # noqa: BLE001
        print("❌ Failed to fetch batteries from database: {}".format(fetch_error))
        return {"total": 0, "successful": 0, "failed": 0, "error": str(fetch_error)}

    batteries = response.data
    if not batteries:
        print("⚠️ No batteries found in database")
        return {"total": 0, "successful": 0, "failed": 0, "results": []}

    print("📋 Found {} batteries to update\n".format(len(batteries)))

    results = []
    for battery in batteries:
        results.append(update_battery_price(battery))
        # A small delay between requests to be respectful to servers.
        time.sleep(2)

    print("\n📊 BATCH UPDATE SUMMARY:")
    print("========================")

    successful = [result for result in results if result["success"]]
    failed = [result for result in results if not result["success"]]

    if successful:
        print("\n✅ Successful updates:")
        for result in successful:
            change = ""
            if result["price_change"]:
                change = " ({}${:.2f})".format(
                    "+" if result["price_change"] >= 0 else "-", abs(result["price_change"])
                )
            print("  • {}: ${}{}".format(result["battery_name"], result["new_price"], change))

    if failed:
        print("\n❌ Failed updates:")
        for result in failed:
            print("  • {}: {}".format(result["battery_name"], result["error"]))

    print("\n🎯 Success: {}/{} batteries updated".format(len(successful), len(results)))

    return {
        "total": len(results),
        "successful": len(successful),
        "failed": len(failed),
        "results": results,
    }


def _main():
    battery_id = sys.argv[1] if len(sys.argv) > 1 else None

    if battery_id:
        admin = get_supabase_admin()
        try:
            response = (
                admin.table("batteries")
                .select("id, name, current_price, target_url")
                .eq("id", battery_id)
                .single()
                .execute()
            )
            data = response.data
        except Exception as error:  # noqa: BLE001
            print("❌ Battery {} not found: {}".format(battery_id, error))
            return 1

        if not data:
            print("❌ Battery {} not found".format(battery_id))
            return 1

        result = update_battery_price(data)
        if result["success"]:
            print("\n✨ Done!")
            return 0
        print("\n❌ Failed: {}".format(result.get("error")))
        return 1

    try:
        summary = update_all_prices()
    except Exception as error:  # noqa: BLE001
        print("\n❌ Batch update failed: {}".format(error))
        return 1

    print("\n✨ Batch update completed!")
    # Fail the whole run only when nothing succeeded (e.g. database down, bad
    # credentials, or the initial battery fetch failed). A handful of individual
    # scrape failures shouldn't block the other batteries' prices from updating;
    # those are already logged to price_extraction_failures for follow-up.
    total_failure = bool(summary.get("error")) or (summary["total"] > 0 and summary["successful"] == 0)
    return 1 if total_failure else 0


if __name__ == "__main__":
    sys.exit(_main())
