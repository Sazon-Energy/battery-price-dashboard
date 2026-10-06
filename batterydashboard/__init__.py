"""Flask application factory for the battery price dashboard."""

from flask import Flask, jsonify

from . import config
from .admin_auth import is_admin
from .database import get_supabase


def _count_pending_candidates():
    """Return how many battery candidates await review, or ``None`` if unavailable."""
    try:
        return (
            get_supabase()
            .table("battery_candidates")
            .select("id", count="exact", head=True)
            .eq("status", "pending")
            .execute()
            .count
        )
    except Exception:  # noqa: BLE001 - the header badge must never break a page
        return None


def create_app() -> Flask:
    """Build and configure the Flask application."""
    app = Flask(__name__)
    app.secret_key = config.SESSION_SECRET or "dev-insecure-change-me"

    from .routes.admin import admin_blueprint
    from .routes.api import api_blueprint
    from .routes.dashboard import dashboard_blueprint

    app.register_blueprint(dashboard_blueprint)
    app.register_blueprint(api_blueprint)
    app.register_blueprint(admin_blueprint)

    @app.context_processor
    def inject_header_state():
        # Makes `is_admin` and the pending-candidate badge count available to
        # every template (header nav).
        return {"is_admin": is_admin(), "pending_candidate_count": _count_pending_candidates()}

    @app.get("/healthz")
    def healthz():
        return jsonify(status="ok")

    return app
