"""Load the discovery service configuration (``config/discovery-config.json``).

Shared by both scraper services. The path is resolved relative to the repository
root so it works regardless of the current working directory.
"""

import json
import os

_PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_PACKAGE_DIR)
_DEFAULT_CONFIG_PATH = os.path.join(_REPO_ROOT, "config", "discovery-config.json")


def load_discovery_config(path=_DEFAULT_CONFIG_PATH):
    """Return the full discovery configuration as a dict."""
    with open(path, "r", encoding="utf-8") as config_file:
        return json.load(config_file)


def load_llm_fallback_config(path=_DEFAULT_CONFIG_PATH):
    """Return ``{"enabled": bool, "max_calls_per_run": int}``.

    Defaults safely (disabled, zero budget) if the config file is missing or
    malformed, mirroring the Node ``loadLlmFallbackConfig`` behavior so a bad
    config file never crashes price scraping.
    """
    try:
        config = load_discovery_config(path)
        return {
            "enabled": bool(config.get("llmFallbackEnabled", False)),
            "max_calls_per_run": config.get("llmFallbackMaxCallsPerRun", 0) or 0,
        }
    except Exception:  # noqa: BLE001 - any read/parse failure -> safe defaults
        return {"enabled": False, "max_calls_per_run": 0}
