"""Session-based admin authentication.

Replaces the previous shared ``X-Admin-Token`` header scheme. A single admin
password (``ADMIN_PASSWORD``) is checked at ``/login``; on success the session
cookie — signed with ``SESSION_SECRET`` — carries ``is_admin`` and gates the
approve/reject actions and the candidate review page.
"""

import functools
import hmac

from flask import redirect, request, session, url_for

from . import config


def is_admin():
    """True if the current session is authenticated as admin."""
    return bool(session.get("is_admin"))


def check_admin_password(password):
    """Constant-time comparison against ``ADMIN_PASSWORD``.

    Returns False (fails closed) when ``ADMIN_PASSWORD`` is not configured, so a
    missing secret locks the admin area rather than opening it.
    """
    expected = config.ADMIN_PASSWORD
    if not expected or not password:
        return False
    return hmac.compare_digest(str(password), str(expected))


def login_required(view):
    """Redirect to the login page (preserving the target) if not authenticated."""

    @functools.wraps(view)
    def wrapped_view(*args, **kwargs):
        if not is_admin():
            return redirect(url_for("admin.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped_view
