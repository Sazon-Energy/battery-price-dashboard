"""Regression check for the price extractor.

Compares ``extract_price_from_html`` against ``tests/fixtures/golden.json`` — a
snapshot captured from the ORIGINAL Node ``lib/price-extractor.js`` during the
Python migration. Exits non-zero on any divergence, so it can gate CI.

    .venv/bin/python tests/parity_check.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from batterydashboard.extraction.price_extractor import extract_price_from_html  # noqa: E402

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def prices_equal(left, right):
    if left is None or right is None:
        return left is None and right is None
    return abs(float(left) - float(right)) < 1e-6


def format_price(value):
    return "None" if value is None else "{:.2f}".format(float(value))


def main():
    manifest = json.loads((FIXTURES_DIR / "manifest.json").read_text())
    golden = json.loads((FIXTURES_DIR / "golden.json").read_text())

    header = "{:<18} {:>10} {:>10}  {:<34} {:<34}".format(
        "fixture", "golden $", "py $", "golden method", "py method"
    )
    print(header)
    print("-" * len(header))

    all_match = True
    for entry in manifest:
        fixture = entry["file"]
        url = entry["url"]
        html = (FIXTURES_DIR / fixture).read_text()

        python_result = extract_price_from_html(html, url)
        golden_result = golden[fixture]

        price_ok = prices_equal(python_result["price"], golden_result["price"])
        method_ok = python_result["method"] == golden_result["method"]
        matched = price_ok and method_ok
        all_match = all_match and matched

        print(
            "{:<18} {:>10} {:>10}  {:<34} {:<34} {}".format(
                fixture,
                format_price(golden_result["price"]),
                format_price(python_result["price"]),
                str(golden_result["method"]),
                str(python_result["method"]),
                "OK" if matched else "MISMATCH",
            )
        )

    print()
    if all_match:
        print("All {} fixtures match the frozen Node golden output.".format(len(manifest)))
        return 0
    print("REGRESSION: at least one fixture diverged from the golden snapshot.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
