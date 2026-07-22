"""Flask application factory for the battery price dashboard."""

from flask import Flask, jsonify

from . import config
from .admin_auth import is_admin


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
    def inject_admin_state():
        # Makes `is_admin` available to every template (header nav).
        return {"is_admin": is_admin()}

    @app.get("/healthz")
    def healthz():
        return jsonify(status="ok")

    return app
