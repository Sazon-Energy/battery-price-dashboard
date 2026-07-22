"""JSON API endpoints.

Port of ``app/api/price-history/route.js``. Used by the dashboard's price-history
modal. (The old unauthenticated ``/api/update-price`` route is intentionally not
ported — the UI never called it and the scrapers write directly.)
"""

from flask import Blueprint, jsonify, request

from ..database import get_supabase

api_blueprint = Blueprint("api", __name__)


@api_blueprint.get("/api/price-history")
def price_history():
    battery_id = request.args.get("batteryId")
    if not battery_id:
        return jsonify(error="Battery ID is required"), 400

    try:
        supabase = get_supabase()
        history = (
            supabase.table("price_history")
            .select("price, scraped_at")
            .eq("battery_id", battery_id)
            .order("scraped_at", desc=True)
            .limit(50)
            .execute()
            .data
        ) or []
        return jsonify(success=True, history=history)
    except Exception as error:  # noqa: BLE001
        return jsonify(error=str(error) or "Failed to fetch price history"), 500
