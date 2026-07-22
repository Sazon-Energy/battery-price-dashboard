"""Production WSGI entrypoint.

Render (and gunicorn locally) load this module and serve ``app``:

    gunicorn wsgi:app
"""

from batterydashboard import create_app

app = create_app()
