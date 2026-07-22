"""Central configuration loaded from environment variables.

During local development these values come from ``.env.local`` (loaded via
python-dotenv). In GitHub Actions and on Render they come from injected
environment variables / secrets, so the ``.env.local`` load is a harmless no-op
there (the file is absent and existing environment variables are not overridden).

Environment variable names are kept identical to the previous Node application
so that existing GitHub Actions secrets and hosting settings do not need to be
re-entered. The ``NEXT_PUBLIC_`` prefix is meaningless in Python but harmless.
"""

import os

from dotenv import load_dotenv

# override=False so real environment variables (CI / Render) always win over
# anything in a local .env.local file.
load_dotenv(".env.local", override=False)

# Supabase project endpoint. SUPABASE_URL is accepted as an alternate name,
# matching the previous scripts/supabase-admin.js behavior.
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")

# Public anon key: read-only access constrained by row-level security.
SUPABASE_ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

# Secret service-role key: bypasses row-level security. Server / CI only.
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Anthropic API key for the LLM extraction fallback (optional; extraction
# degrades gracefully when this is absent).
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

# Admin login: the password is checked at /login and the resulting session
# cookie is signed with SESSION_SECRET.
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
SESSION_SECRET = os.environ.get("SESSION_SECRET")
