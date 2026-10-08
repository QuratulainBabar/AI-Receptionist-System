# Deploy: aidoctor.toolkitpro.cloud

Push to `main` runs [`.github/workflows/deploy.yml`](workflows/deploy.yml):

| Surface | URL | Server path |
|---------|-----|-------------|
| Frontend | `https://aidoctor.toolkitpro.cloud/` | `/home/limiria/public_html/aidoctor` |
| Backend app | `https://aidoctor.toolkitpro.cloud/backend` | `/home/limiria/aidoctor.toolkitpro.cloud/app` + PM2 `:4000` |

`/backend/*` is reverse-proxied via `.htaccess` (`THE_REQUEST` rewrite → `127.0.0.1:4000`).

Use **HTTPS** for both. An HTTPS page cannot call `http://.../backend` (mixed content).

## GitHub secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|--------|
| `SSH_HOST` | `82.25.116.95` |
| `SSH_USER` | `limiria` |
| `SSH_KEY` | Private key for deploy SSH (full PEM) |
| `SSH_PORT` | `22` (optional; defaults to 22) |

Do **not** put the database password in GitHub. It lives only in the server `.env`.

## One-time server setup

### 1. Paths

```bash
mkdir -p /home/limiria/aidoctor.toolkitpro.cloud/app
mkdir -p /home/limiria/public_html/aidoctor
```

### 2. Node.js + PM2

```bash
node -v   # need v20+
mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"
npm i -g pm2
pm2 startup   # follow the printed command once
```

### 3. Create PostgreSQL database

```bash
psql -U postgres -h localhost
```

```sql
CREATE USER aidoctor WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE aidoctor OWNER aidoctor;
GRANT ALL PRIVILEGES ON DATABASE aidoctor TO aidoctor;
\c aidoctor
GRANT ALL ON SCHEMA public TO aidoctor;
```

### 4. Server `.env` (never overwritten by Actions)

Create `/home/limiria/aidoctor.toolkitpro.cloud/app/.env`:

```env
DATABASE_URL="postgresql://aidoctor:STRONG_PASSWORD@localhost:5432/aidoctor?schema=public"
JWT_SECRET="long-random-secret"
JWT_EXPIRES_IN="7d"
PORT=4000
CLIENT_URL="https://aidoctor.toolkitpro.cloud"
NODE_ENV="production"
PUBLIC_API_URL="https://aidoctor.toolkitpro.cloud/backend"
# plus Synthflow / Stripe / CLINIC_TIMEZONE as needed
```

### 5. `/backend` proxy

Deployed `.htaccess` in the frontend docroot proxies:

`https://aidoctor.toolkitpro.cloud/backend/api/health` → `http://127.0.0.1:4000/api/health`

## Verify after deploy

1. GitHub Actions run is green
2. `https://aidoctor.toolkitpro.cloud/` loads the app
3. `https://aidoctor.toolkitpro.cloud/backend/api/health` returns `{ "ok": true, "service": "ai-receptionist-backend" }`
4. Login works with no mixed-content errors in the browser console

## Manual PM2 commands (SSH)

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
cd /home/limiria/aidoctor.toolkitpro.cloud/app
pm2 status
pm2 logs aidoctor-api
pm2 restart aidoctor-api
```
