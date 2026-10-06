"""Suggest a battery class from the specs stored when a battery was discovered.

The specs come from ``battery_candidates.extracted_specs`` (capacity, continuous
power, one "peak" reading, plus the page text each was matched from). They are
compared against every ``battery_classes`` row; the class matching the most
specs wins.

The discovery extractor lumps "surge", "peak", "max" and "starting" figures into
a single ``peak_power_w``. Here that reading is sorted back into peak or surge
by the word it was matched from, so it is compared with the right class column.

This is a deliberately simple, one-battery-at-a-time heuristic: nothing is
saved, and an admin must click Apply to assign the suggested class.
"""

# A detected value "matches" a class value when within this fraction of it,
# e.g. 1.07 kWh matches a 1.0 kWh class.
MATCH_TOLERANCE = 0.10

_SURGE_WORDS = ("surge", "starting")

# Form fields for adding a class, in display order.
NEW_CLASS_FIELD_NAMES = ("short_name", "capacity_kwh", "continuous_power_w", "peak_power_w", "surge_power_w")


def _is_close(detected_value, class_value):
    if detected_value is None or not class_value:
        return False
    return abs(detected_value - class_value) / class_value <= MATCH_TOLERANCE


def _as_number(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _clean_matched_text(text):
    """Collapse the newlines/indentation scraped page text often carries."""
    return " ".join(str(text).split()) if text else None


def _is_surge_reading(matched_text):
    """True when the extractor's "peak" reading was matched from a surge word."""
    lowered = (matched_text or "").lower()
    return any(word in lowered for word in _SURGE_WORDS)


def _continuous_power_warning(capacity_kwh, continuous_power_w, highest_reading_w):
    """Return why the continuous power reading looks wrong, or None."""
    if continuous_power_w is None:
        return None
    if highest_reading_w is not None and continuous_power_w == highest_reading_w:
        return "Continuous power equals the peak/surge reading; that figure was likely read as continuous."
    if capacity_kwh is not None and abs(continuous_power_w - capacity_kwh * 1000) < 1:
        return "Continuous power equals the capacity in Wh; the capacity was likely read as power."
    return None


def summarize_specs(extracted_specs):
    """Normalize ``extracted_specs`` into the values and evidence the UI shows."""
    specs = extracted_specs if isinstance(extracted_specs, dict) else {}
    capacity_kwh = _as_number(specs.get("capacity_kwh"))
    continuous_power_w = _as_number(specs.get("power_w"))
    highest_reading_w = _as_number(specs.get("peak_power_w"))
    highest_reading_matched = _clean_matched_text(specs.get("peak_power_matched"))

    is_surge = _is_surge_reading(highest_reading_matched)
    peak_power_w = None if is_surge else highest_reading_w
    surge_power_w = highest_reading_w if is_surge else None

    return {
        "capacity_kwh": capacity_kwh,
        "continuous_power_w": continuous_power_w,
        "peak_power_w": peak_power_w,
        "surge_power_w": surge_power_w,
        "capacity_matched": _clean_matched_text(specs.get("capacity_matched")),
        "capacity_source": specs.get("capacity_source"),
        "continuous_power_matched": _clean_matched_text(specs.get("power_matched")),
        "peak_power_matched": None if is_surge else highest_reading_matched,
        "surge_power_matched": highest_reading_matched if is_surge else None,
        "continuous_power_warning": _continuous_power_warning(
            capacity_kwh, continuous_power_w, highest_reading_w
        ),
        "has_any_spec": any(
            value is not None for value in (capacity_kwh, continuous_power_w, highest_reading_w)
        ),
    }


def _reliable_continuous_power(spec_summary):
    if spec_summary["continuous_power_warning"]:
        return None
    return spec_summary["continuous_power_w"]


def suggest_class(spec_summary, battery_classes):
    """Pick the best-matching class for one battery's spec summary.

    A class qualifies when its capacity matches; if either side's capacity is
    unknown, continuous power must match instead. Continuous power is ignored
    when it carries a warning. Returns a dict with ``status`` of
    ``"full_match"`` (capacity and continuous both match, nothing differs),
    ``"partial_match"`` or ``"no_match"``.
    """
    detected_values = {
        "capacity": spec_summary["capacity_kwh"],
        "continuous power": _reliable_continuous_power(spec_summary),
        "peak power": spec_summary["peak_power_w"],
        "surge power": spec_summary["surge_power_w"],
    }

    best_suggestion = None
    for battery_class in battery_classes:
        class_values = {
            "capacity": _as_number(battery_class.get("capacity_kwh")),
            "continuous power": battery_class.get("continuous_power_w"),
            "peak power": battery_class.get("peak_power_w"),
            "surge power": battery_class.get("surge_power_w"),
        }

        matched_specs, mismatched_specs, unknown_specs = [], [], []
        for spec_name, detected_value in detected_values.items():
            class_value = class_values[spec_name]
            if detected_value is None or class_value is None:
                unknown_specs.append(spec_name)
            elif _is_close(detected_value, class_value):
                matched_specs.append(spec_name)
            else:
                mismatched_specs.append(spec_name)

        if "capacity" in mismatched_specs:
            continue
        if "capacity" in unknown_specs and "continuous power" not in matched_specs:
            continue

        is_full_match = (
            not mismatched_specs
            and "capacity" in matched_specs
            and "continuous power" in matched_specs
        )
        suggestion = {
            "battery_class": battery_class,
            "matched_specs": matched_specs,
            "mismatched_specs": mismatched_specs,
            "unknown_specs": unknown_specs,
            "status": "full_match" if is_full_match else "partial_match",
        }
        if best_suggestion is None or (len(matched_specs), -len(mismatched_specs)) > (
            len(best_suggestion["matched_specs"]),
            -len(best_suggestion["mismatched_specs"]),
        ):
            best_suggestion = suggestion

    if best_suggestion is not None:
        return best_suggestion

    # No class is within tolerance. Report the closest class by capacity purely as
    # context (no tolerance applies here, and it is never offered for Apply),
    # along with how far off it is.
    capacity_kwh = detected_values["capacity"]
    nearest_class = None
    nearest_class_difference_percent = None
    if capacity_kwh:
        classes_with_capacity = [
            battery_class for battery_class in battery_classes if battery_class.get("capacity_kwh")
        ]
        if classes_with_capacity:
            nearest_class = min(
                classes_with_capacity,
                key=lambda battery_class: abs(float(battery_class["capacity_kwh"]) - capacity_kwh),
            )
            nearest_class_difference_percent = round(
                (float(nearest_class["capacity_kwh"]) - capacity_kwh) / capacity_kwh * 100
            )
    return {
        "status": "no_match",
        "nearest_class": nearest_class,
        "nearest_class_difference_percent": nearest_class_difference_percent,
    }


def _format_capacity_for_name(capacity_kwh):
    """1.024 -> "1", 1.536 -> "1.5", 3.072 -> "3.1" (one decimal, trailing .0 dropped)."""
    return "{:g}".format(round(capacity_kwh, 1))


def suggest_new_class_values(spec_summary):
    """Prefilled, editable values for adding a class from one battery's specs.

    Values that were not detected, or are flagged as unreliable, are left blank
    for the admin to fill in. The suggested name follows the existing
    "<capacity>kWh-<continuous>W" pattern; chemistry (e.g. "LFP-") is not
    detected, so the admin adds it if wanted.
    """
    if not spec_summary:
        return {field_name: "" for field_name in NEW_CLASS_FIELD_NAMES}

    capacity_kwh = spec_summary["capacity_kwh"]
    continuous_power_w = _reliable_continuous_power(spec_summary)

    name_parts = []
    if capacity_kwh is not None:
        name_parts.append("{}kWh".format(_format_capacity_for_name(capacity_kwh)))
    if continuous_power_w is not None:
        name_parts.append("{:.0f}W".format(continuous_power_w))

    def watts(value):
        return "{:.0f}".format(value) if value is not None else ""

    return {
        "short_name": "-".join(name_parts),
        "capacity_kwh": "{:g}".format(capacity_kwh) if capacity_kwh is not None else "",
        "continuous_power_w": watts(continuous_power_w),
        "peak_power_w": watts(spec_summary["peak_power_w"]),
        "surge_power_w": watts(spec_summary["surge_power_w"]),
    }

