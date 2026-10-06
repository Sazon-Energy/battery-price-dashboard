"""Admin area: login/logout, candidate review, approve/reject, battery class assignment.

Ports ``app/candidates/page.js`` (server-rendered) plus
``app/api/candidates/approve/route.js`` and ``.../reject/route.js``. The
approve/reject actions are plain HTML form POSTs guarded by a Flask session
(``login_required``) instead of the old ``X-Admin-Token`` header.
"""

from datetime import timezone

from flask import (
    Blueprint,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from ..admin_auth import check_admin_password, login_required
from ..class_suggestion import suggest_class, suggest_new_class_values, summarize_specs
from ..database import get_supabase, get_supabase_admin
from ..timeutil import now_iso, parse_iso

admin_blueprint = Blueprint("admin", __name__)

_SORT_OPTIONS = [
    {"column": "manufacturer", "label": "Manufacturer"},
    {"column": "name", "label": "Battery Name"},
    {"column": "discovered_at", "label": "Discovered"},
]
_SORT_COLUMNS = {option["column"] for option in _SORT_OPTIONS}
_DEFAULT_SORT_COLUMNS = ["manufacturer", "name", "discovered_at"]


# --- display formatting (server-side equivalents of the old client helpers) ---


def _format_datetime(timestamp):
    parsed = parse_iso(timestamp)
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


# --- battery class assignment ---


CLASS_NAME_MAXIMUM_LENGTH = 200  # matches the battery_classes_short_name_length CHECK
CLASS_COLUMNS = "id, short_name, capacity_kwh, continuous_power_w, peak_power_w, surge_power_w"


@admin_blueprint.get("/classes")
@login_required
def classes():
    supabase = get_supabase()

    battery_classes = (
        supabase.table("battery_classes")
        .select(CLASS_COLUMNS)
        .order("short_name")
        .execute()
        .data
    ) or []
    batteries = (
        supabase.table("batteries")
        .select("id, name, supplier, target_url, battery_class_id")
        .order("name")
        .execute()
        .data
    ) or []

    batteries_by_class_id = {}
    for battery in batteries:
        batteries_by_class_id.setdefault(battery.get("battery_class_id"), []).append(battery)

    known_class_ids = {battery_class["id"] for battery_class in battery_classes}
    # Batteries pointing at a class that no longer exists are treated as unclassified.
    unclassified_batteries = [
        battery
        for class_id, class_batteries in batteries_by_class_id.items()
        if class_id not in known_class_ids
        for battery in class_batteries
    ]
    unclassified_batteries.sort(key=lambda battery: (battery.get("name") or "").casefold())

    class_groups = [
        {"id": None, "title": "Unclassified", "battery_class": None, "batteries": unclassified_batteries}
    ]
    for battery_class in battery_classes:
        class_groups.append(
            {
                "id": battery_class["id"],
                "title": battery_class["short_name"],
                "battery_class": battery_class,
                "batteries": batteries_by_class_id.get(battery_class["id"], []),
            }
        )

    return render_template(
        "classes.html",
        class_groups=class_groups,
        battery_classes=battery_classes,
        battery_count=len(batteries),
        unclassified_count=len(unclassified_batteries),
    )


def _parse_positive_number(raw_value, field_label, errors, whole_number=False, required=True):
    """Parse a form number; a blank optional field returns None without an error."""
    text = (raw_value or "").strip().replace(",", "")
    if not text:
        if required:
            errors.append("{} is required.".format(field_label))
        return None
    try:
        value = float(text)
    except ValueError:
        errors.append("{} must be a number.".format(field_label))
        return None
    if value <= 0:
        errors.append("{} must be greater than 0.".format(field_label))
        return None
    if whole_number:
        if value != int(value):
            errors.append("{} must be a whole number of watts.".format(field_label))
            return None
        return int(value)
    return value


def _validate_new_class(form):
    """Validate add-class form fields. Returns ``(values, errors)``."""
    errors = []

    short_name = (form.get("short_name") or "").strip()
    if not short_name:
        errors.append("Name is required.")
    elif len(short_name) > CLASS_NAME_MAXIMUM_LENGTH:
        errors.append("Name must be {} characters or fewer.".format(CLASS_NAME_MAXIMUM_LENGTH))

    capacity_kwh = _parse_positive_number(
        form.get("capacity_kwh"), "Capacity", errors, required=False
    )
    continuous_power_w = _parse_positive_number(
        form.get("continuous_power_w"), "Continuous power", errors, whole_number=True
    )
    peak_power_w = _parse_positive_number(
        form.get("peak_power_w"), "Peak power", errors, whole_number=True, required=False
    )
    surge_power_w = _parse_positive_number(
        form.get("surge_power_w"), "Surge power", errors, whole_number=True, required=False
    )
    for label, power_w in (("Peak power", peak_power_w), ("Surge power", surge_power_w)):
        if continuous_power_w and power_w and power_w < continuous_power_w:
            errors.append("{} can't be lower than continuous power.".format(label))

    values = {
        "short_name": short_name,
        "capacity_kwh": capacity_kwh,
        "continuous_power_w": continuous_power_w,
        "peak_power_w": peak_power_w,
        "surge_power_w": surge_power_w,
    }
    return values, errors


@admin_blueprint.post("/classes/apply-from-suggestion")
@login_required
def apply_class_from_suggestion():
    """Apply the class chosen in a suggestion panel to the battery being reviewed.

    ``class_choice`` is an existing class id, or ``"new"`` to create a class
    from the submitted fields and apply it in one step. Submitted in the
    background: on errors the panel is returned (status 400) with the messages
    and entered values; on success a flash message is set and JSON names the
    page to reload.
    """
    battery_id = request.form.get("battery_id")
    class_choice = request.form.get("class_choice")
    if not battery_id or not class_choice:
        return "battery_id and class_choice required", 400

    supabase = get_supabase()
    admin = get_supabase_admin()
    try:
        battery_rows = (
            supabase.table("batteries")
            .select("id, name, battery_class_id")
            .eq("id", battery_id)
            .limit(1)
            .execute()
            .data
        ) or []
        if not battery_rows:
            return "Battery not found", 404
        battery = battery_rows[0]

        battery_classes = (
            supabase.table("battery_classes")
            .select(CLASS_COLUMNS)
            .order("short_name")
            .execute()
            .data
        ) or []
    except Exception as error:  # noqa: BLE001 - shown as plain text in the panel
        return "Could not apply the class: {}".format(error), 500

    def render_panel_with_errors(error_messages):
        return (
            render_template(
                "class_suggestion_panel.html",
                battery=battery,
                class_suggestion=_build_class_suggestion(supabase, battery_id, battery_classes),
                new_class_form=request.form,
                new_class_errors=error_messages,
            ),
            400,
        )

    if class_choice == "new":
        new_class_values, errors = _validate_new_class(request.form)
        short_name = new_class_values["short_name"]
        if short_name:
            for existing_class in battery_classes:
                if (existing_class["short_name"] or "").casefold() == short_name.casefold():
                    errors.append(
                        'A class named "{}" already exists; choose it from the list instead.'.format(
                            existing_class["short_name"]
                        )
                    )
                    break
        if errors:
            return render_panel_with_errors(errors)

        try:
            inserted = admin.table("battery_classes").insert(new_class_values).execute().data
        except Exception as error:  # noqa: BLE001
            return render_panel_with_errors(["Failed to add class: {}".format(error)])
        if not inserted:
            return render_panel_with_errors(["Failed to add class."])
        class_id, class_name = inserted[0]["id"], short_name
        success_message = 'Added class "{}" and applied it to "{}"'.format(class_name, battery["name"])
    else:
        chosen_class = next(
            (battery_class for battery_class in battery_classes if battery_class["id"] == class_choice), None
        )
        if chosen_class is None:
            return render_panel_with_errors(["That class no longer exists."])
        class_id, class_name = chosen_class["id"], chosen_class["short_name"]
        success_message = 'Moved "{}" to {}'.format(battery["name"], class_name)

    try:
        admin.table("batteries").update({"battery_class_id": class_id}).eq("id", battery_id).execute()
        flash(success_message, "success")
    except Exception as error:  # noqa: BLE001
        flash('Could not apply "{}" to "{}": {}'.format(class_name, battery["name"], error), "error")

    return jsonify(redirect_url=url_for("admin.classes", _anchor="battery-{}".format(battery_id)))


@admin_blueprint.get("/classes/suggestion")
@login_required
def class_suggestion():
    """Return the suggestion panel (an HTML fragment) for one battery.

    Fetched in the background by ``class_suggestion.js`` when an admin clicks
    "Suggest class"; only that one battery's stored specs are read.
    """
    battery_id = request.args.get("battery_id")
    if not battery_id:
        return "battery_id required", 400

    supabase = get_supabase()
    try:
        battery_rows = (
            supabase.table("batteries")
            .select("id, name, battery_class_id")
            .eq("id", battery_id)
            .limit(1)
            .execute()
            .data
        ) or []
        if not battery_rows:
            return "Battery not found", 404

        battery_classes = (
            supabase.table("battery_classes")
            .select(CLASS_COLUMNS)
            .order("short_name")
            .execute()
            .data
        ) or []
        suggestion = _build_class_suggestion(supabase, battery_id, battery_classes)
    except Exception as error:  # noqa: BLE001 - shown as plain text in the panel
        return "Could not load a suggestion: {}".format(error), 500

    return render_template(
        "class_suggestion_panel.html",
        battery=battery_rows[0],
        class_suggestion=suggestion,
        new_class_form=None,
        new_class_errors=[],
    )


def _build_class_suggestion(supabase, battery_id, battery_classes):
    """Look up one battery's stored specs and suggest a class for it."""
    candidate_rows = (
        supabase.table("battery_candidates")
        .select("extracted_specs")
        .eq("battery_id", battery_id)
        .order("reviewed_at", desc=True, nullsfirst=False)
        .limit(1)
        .execute()
        .data
    ) or []
    spec_summary = summarize_specs(candidate_rows[0].get("extracted_specs")) if candidate_rows else None
    if spec_summary is None or not spec_summary["has_any_spec"]:
        return {
            "spec_summary": None,
            "suggestion": None,
            "new_class_defaults": suggest_new_class_values(None),
            "battery_classes": battery_classes,
        }
    return {
        "battery_classes": battery_classes,
        "spec_summary": spec_summary,
        "suggestion": suggest_class(spec_summary, battery_classes),
        "new_class_defaults": suggest_new_class_values(spec_summary),
    }


@admin_blueprint.post("/classes/assign")
@login_required
def assign_class():
    battery_id = request.form.get("battery_id")
    # An empty value means "Unclassified".
    battery_class_id = request.form.get("battery_class_id") or None
    if not battery_id:
        flash("battery_id required", "error")
        return redirect(url_for("admin.classes"))

    admin = get_supabase_admin()

    class_name = "Unclassified"
    if battery_class_id is not None:
        matching_classes = (
            admin.table("battery_classes")
            .select("short_name")
            .eq("id", battery_class_id)
            .execute()
            .data
        ) or []
        if not matching_classes:
            flash("Battery class not found", "error")
            return redirect(url_for("admin.classes"))
        class_name = matching_classes[0]["short_name"]

    try:
        updated = (
            admin.table("batteries")
            .update({"battery_class_id": battery_class_id})
            .eq("id", battery_id)
            .execute()
            .data
        )
    except Exception as error:  # noqa: BLE001
        flash("Failed to update battery class: {}".format(error), "error")
        return redirect(url_for("admin.classes"))

    if not updated:
        flash("Battery not found", "error")
        return redirect(url_for("admin.classes"))

    flash('Moved "{}" to {}'.format(updated[0]["name"], class_name), "success")
    return redirect(url_for("admin.classes", _anchor="battery-{}".format(battery_id)))
