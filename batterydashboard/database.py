"""Supabase clients (PostgREST over HTTPS).

Mirrors the previous ``lib/supabase.js`` (anon key, read-only) and
``lib/supabase-admin.js`` (service-role key, bypasses row-level security)
modules. Both clients are created lazily and cached, so importing this module
never fails when credentials are absent; the configuration error is raised only
when a client is actually requested.
"""

from supabase import Client, create_client

from . import config

_anon_client = None
_admin_client = None


def get_supabase() -> Client:
    """Return the shared anon-key client (read-only, RLS-constrained)."""
    global _anon_client
    if _anon_client is not None:
        return _anon_client
    if not config.SUPABASE_URL or not config.SUPABASE_ANON_KEY:
        raise RuntimeError(
            "Supabase anon client not configured "
            "(NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required)"
        )
    _anon_client = create_client(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
    return _anon_client


def get_supabase_admin() -> Client:
    """Return the shared service-role client (bypasses row-level security).

    Server / CI only — never expose this client or its key to the browser.
    """
    global _admin_client
    if _admin_client is not None:
        return _admin_client
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Supabase admin client not configured "
            "(NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required)"
        )
    _admin_client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
    return _admin_client
