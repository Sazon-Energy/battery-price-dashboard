# Deployment Guide

**See [README.md](./README.md) for complete instructions.**

## Quick Links

- **Local Development**: [README.md#local-development](./README.md#local-development)
- **Database Setup**: [README.md#2-database-setup](./README.md#2-database-setup)
- **Environment Variables**: [README.md#3-environment-variables](./README.md#3-environment-variables)
- **Render Deployment**: [README.md#deployment-to-render](./README.md#deployment-to-render)
- **Security**: [README.md#security-architecture](./README.md#security-architecture)

## TL;DR

### Local dev

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Create .env.local with Supabase keys + ADMIN_PASSWORD + SESSION_SECRET
flask --app batterydashboard run       # http://localhost:5000
```

### Scraper services (local)

```bash
python -m services.update_all_prices        # refresh all battery prices
python -m services.update_all_prices <id>   # refresh one battery
python -m services.discover_batteries       # discover new candidates
```

### Production deploy (Render)

1. Push to `main`.
2. First time: Render dashboard → New + → Blueprint → connect the repo (reads `render.yaml`).
3. Set the secret env vars in the Render dashboard: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD` (`SESSION_SECRET` is auto-generated).
4. With `autoDeploy: true`, subsequent pushes to `main` redeploy automatically.

### Scheduled services (GitHub Actions)

Set the repository secrets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANTHROPIC_API_KEY`. The two workflows run on cron and can be triggered manually from the Actions tab.

---

For detailed instructions, see the main [README.md](./README.md).
