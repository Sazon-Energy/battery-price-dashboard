"""Scheduled scraper services (run by GitHub Actions).

Invoke as modules from the repository root so both ``services`` and
``batterydashboard`` are importable, e.g.::

    python -m services.update_all_prices
    python -m services.discover_batteries
"""
