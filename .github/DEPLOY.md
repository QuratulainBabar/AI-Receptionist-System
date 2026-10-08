# Deploy: aidoctor.toolkitpro.cloud

Push to `main` runs [`.github/workflows/deploy.yml`](workflows/deploy.yml):

| Surface | URL | Server path |
|---------|-----|-------------|
| Frontend | `https://aidoctor.toolkitpro.cloud/` | `/home/limiria/aidoctor.toolkitpro.cloud/public_html` |
| Backend | `https://aidoctor.toolkitpro.cloud/backend` | `/home/limiria/aidoctor.toolkitpro.cloud/app` + PM2 |

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

### Deploy SSH key (one-time)

On your machine:

```bash
ssh-keygen -t ed25519 -C "github-actions-aidoctor" -f aidoctor_deploy -N ""
```

- Add `aidoctor_deploy.pub` to the server: `~/.ssh/authorized_keys` for `limiria`
- Paste the private key contents into the `SSH_KEY` secret

## One-time server setup

### 1. Paths

```bash
sudo mkdir -p /home/limiria/aidoctor.toolkitpro.cloud/app
sudo chown -R limiria:limiria /home/limiria/aidoctor.toolkitpro.cloud/app
```

Confirm `public_html` exists for the subdomain (CyberPanel creates it).

### 2. Node.js + PM2

```bash
node -v   # need v20+
npm i -g pm2
pm2 startup   # follow the printed command once
```

### 3. Create PostgreSQL database

```bash
sudo -u postgres psql
```

```sql
CREATE USER aidoctor WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE aidoctor OWNER aidoctor;
GRANT ALL PRIVILEGES ON DATABASE aidoctor TO aidoctor;
\c aidoctor
GRANT ALL ON SCHEMA public TO aidoctor;
```

### 4. Server `.env` (never overwritten by Actions)

Create `/home/limiria/aidoctor.toolkitpro.cloud/app/.env` from [`backend/.env.example`](../backend/.env.example):

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

First deploy runs `prisma migrate deploy` against this database.

### 5. OpenLiteSpeed reverse proxy (`/backend`)

In CyberPanel / OpenLiteSpeed for `aidoctor.toolkitpro.cloud`, add a **proxy context**:

- **URI:** `/backend`
- **Handler:** reverse proxy (or Web Server proxy)
- **Address / backend:** `http://127.0.0.1:4000`
- **Strip prefix** `/backend` so Node sees `/api/...` (health check path becomes `/api/health`)

Exact UI labels vary by CyberPanel version. Goal:

`https://aidoctor.toolkitpro.cloud/backend/api/health` → `http://127.0.0.1:4000/api/health`

After saving, restart OpenLiteSpeed if required.

### 6. SPA fallback

[`public/.htaccess`](../public/.htaccess) is copied into `dist/` on build and deployed to `public_html` so client routes (e.g. `/patient`) serve `index.html`.

## Verify after deploy

1. GitHub Actions run is green
2. `https://aidoctor.toolkitpro.cloud/` loads the app
3. `https://aidoctor.toolkitpro.cloud/backend/api/health` returns `{ "ok": true, "service": "ai-receptionist-backend" }`
4. Login works with no mixed-content errors in the browser console

## Manual PM2 commands (SSH)

```bash
cd /home/limiria/aidoctor.toolkitpro.cloud/app
pm2 status
pm2 logs aidoctor-api
pm2 restart aidoctor-api
```
