"""Admin area: login/logout, candidate review, approve/reject.

Ports ``app/candidates/page.js`` (server-rendered) plus
``app/api/candidates/approve/route.js`` and ``.../reject/route.js``. The
approve/reject actions are plain HTML form POSTs guarded by a Flask session
(``login_required``) instead of the old ``X-Admin-Token`` header.
"""

from datetime import datetime, timezone

from flask import (
    Blueprint,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from ..admin_auth import check_admin_password, login_required
from ..database import get_supabase, get_supabase_admin
from ..timeutil import now_iso

admin_blueprint = Blueprint("admin", __name__)

_SORT_OPTIONS = [
    {"column": "manufacturer", "label": "Manufacturer"},
    {"column": "name", "label": "Battery Name"},
    {"column": "discovered_at", "label": "Discovered"},
]
_SORT_COLUMNS = {option["column"] for option in _SORT_OPTIONS}
_DEFAULT_SORT_COLUMNS = ["manufacturer", "name", "discovered_at"]


# --- display formatting (server-side equivalents of the old client helpers) ---


def _parse_iso(timestamp):
    if not timestamp:
        return None
    text = str(timestamp).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        try:
            return datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return None


def _format_datetime(timestamp):
    parsed = _parse_iso(timestamp)
    if parsed is None:
        return "—"
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.strftime("%b %d, %Y %I:%M %p UTC")


def _format_price(price):
    if price is None:
        return "—"
    return "${:,.2f}".format(float(price))


def _format_capacity(specs):
    kwh = specs.get("capacity_kwh") if isinstance(specs, dict) else None
    if kwh is None:
        return "—"
    return "{} kWh".format(kwh)


def _sort_value(candidate, column):
    if column == "manufacturer":
        manufacturer = candidate.get("manufacturers") or {}
        return (manufacturer.get("name") or "").casefold()
    if column == "name":
        return (candidate.get("name") or "").casefold()
    if column == "discovered_at":
        return candidate.get("discovered_at") or ""
    return ""


def _sort_candidates(candidates, sort_column, sort_direction):
    if sort_column:
        candidates.sort(
            key=lambda candidate: _sort_value(candidate, sort_column),
            reverse=(sort_direction == "desc"),
        )
    else:
        candidates.sort(
            key=lambda candidate: tuple(
                _sort_value(candidate, column) for column in _DEFAULT_SORT_COLUMNS
            )
        )
    return candidates


# --- authentication ---


@admin_blueprint.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if check_admin_password(request.form.get("password", "")):
            session["is_admin"] = True
            target = request.form.get("next") or request.args.get("next") or ""
            # Only allow local redirects (guard against open redirect).
            if not target.startswith("/") or target.startswith("//"):
                target = url_for("admin.candidates")
            return redirect(target)
        flash("Invalid password", "error")

    return render_template("login.html", next_path=request.args.get("next", ""))


@admin_blueprint.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("dashboard.index"))


# --- candidate review ---


@admin_blueprint.get("/candidates")
@login_required
def candidates():
    supabase = get_supabase()

    candidate_rows = (
        supabase.table("battery_candidates")
        .select(
            "id, name, normalized_url, discovered_at, discovered_price, "
            "extracted_specs, manufacturers ( name )"
        )
        .eq("status", "pending")
        .order("discovered_at", desc=False)
        .execute()
        .data
    ) or []

    last_run_rows = (
        supabase.table("manufacturers")
        .select("last_searched_at")
        .order("last_searched_at", desc=True, nullsfirst=False)
        .limit(1)
        .execute()
        .data
    ) or []
    last_discovery_run = last_run_rows[0]["last_searched_at"] if last_run_rows else None

    sort_column = request.args.get("sort")
    if sort_column not in _SORT_COLUMNS:
        sort_column = None
    sort_direction = "desc" if request.args.get("dir") == "desc" else "asc"

    _sort_candidates(candidate_rows, sort_column, sort_direction)

    for candidate in candidate_rows:
        candidate["discovered_at_display"] = _format_datetime(candidate.get("discovered_at"))
        candidate["price_display"] = _format_price(candidate.get("discovered_price"))
        candidate["capacity_display"] = _format_capacity(candidate.get("extracted_specs"))

    return render_template(
        "candidates.html",
        candidates=candidate_rows,
        pending_count=len(candidate_rows),
        last_discovery_run_display=_format_datetime(last_discovery_run),
        sort_options=_SORT_OPTIONS,
        sort_column=sort_column,
        sort_direction=sort_direction,
    )


@admin_blueprint.post("/candidates/approve")
@login_required
def approve():
    candidate_id = request.form.get("candidate_id")
    if not candidate_id:
        flash("candidate_id required", "error")
        return redirect(url_for("admin.candidates"))

    admin = get_supabase_admin()

    # Load candidate (must be pending), with its manufacturer name.
    try:
        candidate = (
            admin.table("battery_candidates")
            .select("*, manufacturers(name)")
            .eq("id", candidate_id)
            .eq("status", "pending")
            .single()
            .execute()
            .data
        )
    except Exception:  # noqa: BLE001 - single() raises when no matching pending row
        candidate = None

    if not candidate:
        flash("Candidate not found or not pending", "error")
        return redirect(url_for("admin.candidates"))

    # Insert into batteries. battery_class_id stays NULL; backfilled later.
    manufacturer = candidate.get("manufacturers") or {}
    try:
        inserted = (
            admin.table("batteries")
            .insert(
                {
                    "name": candidate["name"],
                    "target_url": candidate["normalized_url"],
                    "supplier": manufacturer.get("name"),
                    "manufacturer_id": candidate["manufacturer_id"],
                    "current_price": candidate["discovered_price"],
                }
            )
            .execute()
            .data
        )
    except Exception as error:  # noqa: BLE001
        flash("Failed to insert battery: {}".format(error), "error")
        return redirect(url_for("admin.candidates"))

    battery = inserted[0] if inserted else None
    if battery is None:
        flash("Failed to insert battery", "error")
        return redirect(url_for("admin.candidates"))

    # Seed price_history with the discovered price.
    if candidate.get("discovered_price"):
        try:
            admin.table("price_history").insert(
                {
                    "battery_id": battery["id"],
                    "price": candidate["discovered_price"],
                    "scraped_at": candidate["discovered_at"],
                }
            ).execute()
        except Exception as error:  # noqa: BLE001
            print("Failed to seed price_history:", error)

    # Mark candidate approved and link it to the battery it became.
    try:
        admin.table("battery_candidates").update(
            {"status": "approved", "reviewed_at": now_iso(), "battery_id": battery["id"]}
        ).eq("id", candidate_id).execute()
    except Exception as error:  # noqa: BLE001
        print("Failed to mark candidate approved:", error)

    flash('Approved "{}"'.format(candidate["name"]), "success")
    return redirect(url_for("admin.candidates"))


@admin_blueprint.post("/candidates/reject")
@login_required
def reject():
    candidate_id = request.form.get("candidate_id")
    if not candidate_id:
        flash("candidate_id required", "error")
        return redirect(url_for("admin.candidates"))

    admin = get_supabase_admin()
    try:
        admin.table("battery_candidates").update(
            {"status": "rejected", "reviewed_at": now_iso()}
        ).eq("id", candidate_id).eq("status", "pending").execute()
    except Exception as error:  # noqa: BLE001
        flash("Failed to reject candidate: {}".format(error), "error")
        return redirect(url_for("admin.candidates"))

    flash("Candidate rejected", "success")
    return redirect(url_for("admin.candidates"))
