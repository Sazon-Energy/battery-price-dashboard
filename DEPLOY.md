# Deployment Guide

**See [README.md](./README.md) for complete deployment instructions.**

## Quick Links

- **Local Development**: [README.md#local-development](./README.md#local-development)
- **Database Setup**: [README.md#2-database-setup](./README.md#2-database-setup)
- **Environment Variables**: [README.md#3-environment-variables](./README.md#3-environment-variables)
- **Vercel Deployment**: [README.md#deployment-to-vercel](./README.md#deployment-to-vercel)
- **Security**: [README.md#security-architecture](./README.md#security-architecture)

## TL;DR

### Local Dev
```bash
npm install
# Create .env.local with Supabase keys + ADMIN_TOKEN
npm run dev
```

### Production Deploy
1. Push to `main` branch
2. Vercel auto-deploys
3. Add environment variables in Vercel dashboard (if first deploy)
4. Redeploy after adding vars

---

For detailed instructions, see the main [README.md](./README.md).
