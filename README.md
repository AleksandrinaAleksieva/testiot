# Xray Studio — Backend Proxy

Solves the CORS problem: instead of the browser calling Atlassian directly,
the proxy server holds your API credentials and makes all Jira calls server-side.

```
Browser (React portal)
     │  POST /api/execution  { name, tests[] }
     ▼
Proxy Server (Node.js — localhost:3001)
     │  POST https://api.atlassian.com/ex/jira/.../issue  (with secret API token)
     ▼
Atlassian REST API
```

---

## Quick Start

### 1. Install dependencies

```bash
cd xray-proxy
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env`:

```env
JIRA_EMAIL=your.email@company.com
JIRA_API_TOKEN=ATATT3x...         # from id.atlassian.com/manage-profile/security/api-tokens
JIRA_CLOUD_ID=a45ac4b7-7db8-40a7-a5c6-1713fcbd8751
JIRA_DOMAIN=shellyusa.atlassian.net
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### 3. Start the proxy

```bash
npm start
```

You should see:
```
╔══════════════════════════════════════════════╗
║         Xray Studio — Proxy Server           ║
╠══════════════════════════════════════════════╣
║  Listening on  http://localhost:3001         ║
║  Jira domain   shellyusa.atlassian.net       ║
╚══════════════════════════════════════════════╝
```

### 4. Open the portal

Copy `xray-studio.jsx` into your React project (Vite, CRA, etc.) and run it.
The portal will connect to the proxy at `http://localhost:3001`.

---

## API Endpoints

| Method | Path              | Description                              |
|--------|-------------------|------------------------------------------|
| GET    | `/health`         | Liveness check — returns domain/cloudId |
| GET    | `/api/me`         | Verify proxy credentials                 |
| POST   | `/api/execution`  | Create execution + all subtasks at once  |
| POST   | `/api/issue`      | Create a single Jira issue               |
| GET    | `/api/versions`   | List fix versions for a project          |

### POST /api/execution

```json
{
  "name": "[Test Execution] Plug S Gen3 - Bundle",
  "description": "Optional description",
  "fixVersion": "v3.1.0",
  "projectKey": "QAT",
  "tests": [
    { "key": "QAT-120", "summary": "Self-test" },
    { "key": "QAT-123", "summary": "Wi-Fi reconnects automatically after reboot" }
  ]
}
```

Response:
```json
{
  "execKey": "QAT-200",
  "execUrl": "https://shellyusa.atlassian.net/browse/QAT-200",
  "created": [{ "original": "QAT-120", "created": "QAT-201" }],
  "failed": [],
  "total": 2
}
```

---

## Deploying for the team

Instead of running on localhost, deploy the proxy so everyone on the team
can use it without needing their own API token:

| Option                  | Cost   | Complexity |
|-------------------------|--------|------------|
| **Railway / Render**    | Free   | ⭐ Easy — connect GitHub repo, set env vars in dashboard |
| **Fly.io**              | Free   | ⭐⭐ `fly launch`, set secrets with `fly secrets set` |
| **Docker + VPS**        | ~$5/mo | ⭐⭐ `docker build && docker run` |
| **Cloudflare Workers**  | Free   | ⭐⭐⭐ Requires rewriting to Workers API (no Node.js) |

For Railway/Render, set the `ALLOWED_ORIGINS` env var to your hosted portal URL,
e.g. `https://xray-studio.yourcompany.com`.

---

## Security notes

- The `.env` file contains your Atlassian API token — **never commit it to git**
  (`.gitignore` should include `.env`)
- The proxy only exposes the endpoints it needs — it does not forward arbitrary
  requests to Atlassian
- `ALLOWED_ORIGINS` restricts which frontend origins can call the proxy
- For team deployment, consider adding a shared secret header check
  (e.g. `X-Proxy-Secret`) so only your portal can call the proxy

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot reach proxy` | Proxy not running | `npm start` in `xray-proxy/` |
| `CORS: origin not allowed` | Frontend URL not in `ALLOWED_ORIGINS` | Add it to `.env` |
| `Auth failed` | Wrong email/token | Check `.env`, regenerate token |
| `Failed to create execution: HTTP 400` | Issue type name wrong | Verify "Test Execution" exists in QAT project |
| `parent: Field cannot be set` | "Test" type doesn't support `parent` | Use `subtask` type or check Xray config |
