"""Small HTTP helper for the scraper services (replaces axios).

Follows redirects and raises for non-2xx responses, matching the axios defaults
the Node scripts relied on.
"""

import httpx


def fetch_page(url, user_agent, timeout=10.0):
    """GET ``url`` and return ``(status_code, text)``.

    Raises ``httpx.HTTPStatusError`` on a non-2xx response and other
    ``httpx.HTTPError`` subclasses on connection/timeout failures, so callers can
    treat any exception as a fetch failure (as the Node try/catch blocks did).
    """
    response = httpx.get(
        url,
        headers={"User-Agent": user_agent},
        timeout=timeout,
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.status_code, response.text
