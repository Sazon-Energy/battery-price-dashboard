"""Public dashboard page (server-rendered).

Port of ``app/page.js``: renders the battery-classes and batteries tables from
Supabase. The per-battery price-history modal is populated by the JSON endpoint
in ``routes/api.py``; the hover tooltips (last 90 days of prices, full history
date range) are rendered here from ``price_history``.
"""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, render_template

from ..database import get_supabase
from ..timeutil import parse_iso

dashboard_blueprint = Blueprint("dashboard", __name__)

RECENT_PRICE_WINDOW_DAYS = 90
# PostgREST caps responses (1000 rows by default), so price history is read in pages.
PRICE_HISTORY_PAGE_SIZE = 1000


def _fetch_all_price_history(supabase):
    """Return every ``price_history`` row (battery_id, price, scraped_at), newest first."""
    rows = []
    page_start = 0
    while True:
        page = (
            supabase.table("price_history")
            .select("battery_id, price, scraped_at")
            .order("scraped_at", desc=True)
            .order("id")
            .range(page_start, page_start + PRICE_HISTORY_PAGE_SIZE - 1)
            .execute()
            .data
        ) or []
        rows.extend(page)
        if len(page) < PRICE_HISTORY_PAGE_SIZE:
            return rows
        page_start += PRICE_HISTORY_PAGE_SIZE


def _as_utc(moment):
    # Naive timestamps come from the fallback parser; treat them as UTC.
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def _format_date(moment):
    return moment.strftime("%b %d, %Y")


def _format_price(price):
    return "${:,.2f}".format(float(price))


def _pluralize(count, word):
    return "{} {}{}".format(count, word, "" if count == 1 else "s")


def _describe_span(first_moment, last_moment):
    """Human-readable length of a date range, e.g. ``"1 year 2 months"``."""
    span_days = (last_moment.date() - first_moment.date()).days
    if span_days < 60:
        return _pluralize(span_days, "day")
    total_months = round(span_days / 30.44)
    years, months = divmod(total_months, 12)
    parts = []
    if years:
        parts.append(_pluralize(years, "year"))
    if months:
        parts.append(_pluralize(months, "month"))
    return " ".join(parts)


SPARKLINE_WIDTH = 200
SPARKLINE_HEIGHT = 48
# Inset keeps the 2px line and the end-point dot from clipping at the edges.
SPARKLINE_INSET = 4


def _build_sparkline(recent_points):
    """Lay out a stepped price sparkline for points given oldest first.

    Prices hold until the next scrape, so the line steps (horizontal, then
    vertical) instead of interpolating diagonally between readings. Returns
    ``None`` when there are no points.
    """
    if not recent_points:
        return None

    first_moment = recent_points[0][0]
    time_span_seconds = (recent_points[-1][0] - first_moment).total_seconds()
    prices = [price for _, price in recent_points]
    low_price, high_price = min(prices), max(prices)
    price_span = high_price - low_price

    plot_width = SPARKLINE_WIDTH - 2 * SPARKLINE_INSET
    plot_height = SPARKLINE_HEIGHT - 2 * SPARKLINE_INSET

    def x_position(moment):
        if time_span_seconds == 0:
            return SPARKLINE_INSET + plot_width
        elapsed_seconds = (moment - first_moment).total_seconds()
        return SPARKLINE_INSET + plot_width * elapsed_seconds / time_span_seconds

    def y_position(price):
        if price_span == 0:
            return SPARKLINE_INSET + plot_height / 2
        return SPARKLINE_INSET + plot_height * (high_price - price) / price_span

    first_price = recent_points[0][1]
    path_commands = ["M{:.1f},{:.1f}".format(x_position(first_moment), y_position(first_price))]
    previous_price = first_price
    for moment, price in recent_points[1:]:
        path_commands.append("H{:.1f}".format(x_position(moment)))
        if price != previous_price:
            path_commands.append("V{:.1f}".format(y_position(price)))
        previous_price = price

    last_moment, last_price = recent_points[-1]
    return {
        "width": SPARKLINE_WIDTH,
        "height": SPARKLINE_HEIGHT,
        "path": " ".join(path_commands),
        "end_x": "{:.1f}".format(x_position(last_moment)),
        "end_y": "{:.1f}".format(y_position(last_price)),
        "low_price": _format_price(low_price),
        "high_price": _format_price(high_price),
    }


def _summarize_price_history(price_history_rows):
    """Group price history by battery into tooltip-ready summaries.

    Returns ``{battery_id: {"sparkline": dict or None, "first_date", "last_date",
    "span", "record_count"}}``. The sparkline covers the last
    ``RECENT_PRICE_WINDOW_DAYS`` days.
    """
    recent_window_start = datetime.now(timezone.utc) - timedelta(days=RECENT_PRICE_WINDOW_DAYS)
    points_by_battery = {}

    for row in price_history_rows:
        scraped_at = parse_iso(row.get("scraped_at"))
        if scraped_at is None or row.get("price") is None:
            continue
        points_by_battery.setdefault(row["battery_id"], []).append(
            (_as_utc(scraped_at), float(row["price"]))
        )

    summaries = {}
    for battery_id, points in points_by_battery.items():
        points.sort(key=lambda point: point[0])
        first_moment, last_moment = points[0][0], points[-1][0]
        recent_points = [point for point in points if point[0] >= recent_window_start]
        summaries[battery_id] = {
            "sparkline": _build_sparkline(recent_points),
            "first_date": _format_date(first_moment),
            "last_date": _format_date(last_moment),
            "span": _describe_span(first_moment, last_moment),
            "record_count": len(points),
        }
    return summaries


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
        price_history_summaries = _summarize_price_history(_fetch_all_price_history(supabase))
    except Exception as error:  # noqa: BLE001 - show a friendly message instead of a 500
        return render_template("dashboard.html", error=str(error))

    return render_template(
        "dashboard.html",
        battery_classes=battery_classes,
        batteries=batteries,
        price_history_summaries=price_history_summaries,
        recent_price_window_days=RECENT_PRICE_WINDOW_DAYS,
        error=None,
    )
