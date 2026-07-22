"""Public dashboard page (server-rendered).

Port of ``app/page.js``: renders the battery-classes and batteries tables from
Supabase. The per-battery price-history modal is populated by the JSON endpoint
in ``routes/api.py``.
"""

from flask import Blueprint, render_template

from ..database import get_supabase

dashboard_blueprint = Blueprint("dashboard", __name__)


@dashboard_blueprint.get("/")
def index():
    try:
        supabase = get_supabase()
        battery_classes = (
            supabase.table("battery_classes").select("*").order("short_name").execute().data
        ) or []
        batteries = (
            supabase.table("batteries")
            .select("*, battery_classes ( short_name, capacity_kwh, cpower_w, ppower_w )")
            .order("name")
            .execute()
            .data
        ) or []
    except Exception as error:  # noqa: BLE001 - show a friendly message instead of a 500
        return render_template("dashboard.html", error=str(error))

    return render_template(
        "dashboard.html", battery_classes=battery_classes, batteries=batteries, error=None
    )
