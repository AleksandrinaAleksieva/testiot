/**
 * IoT Studio — Backend Proxy Server
 *
 * Credentials come from the frontend per-request via headers:
 *   x-jira-email: user@company.com
 *   x-jira-token: ATATT3x...
 *
 * Nothing is stored server-side. The server is just a CORS bridge.
 */

require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const {
  JIRA_CLOUD_ID   = "a45ac4b7-7db8-40a7-a5c6-1713fcbd8751",
  JIRA_DOMAIN     = "shellyusa.atlassian.net",
  PORT            = 3001,
  ALLOWED_ORIGINS = "*",
} = process.env;

const JIRA_BASE = `https://api.atlassian.com/ex/jira/${JIRA_CLOUD_ID}/rest/api/3`;

// ── Express + CORS ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const origins = ALLOWED_ORIGINS.split(",").map(o => o.trim());
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || origins.includes("*") || origins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-jira-email", "x-jira-token"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── Read credentials from request headers ──────────────────────────────────────
function getAuth(req) {
  const email = req.headers["x-jira-email"];
  const token = req.headers["x-jira-token"];
  if (!email || !token) throw new Error("Missing x-jira-email or x-jira-token headers");
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

// ── Atlassian helper ───────────────────────────────────────────────────────────
async function jira(path, method = "GET", body = null, auth) {
  const res = await fetch(`${JIRA_BASE}${path}`, {
    method,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg =
      data.errors ? Object.values(data.errors).join(", ") :
      data.errorMessages?.join(", ") ||
      data.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, domain: JIRA_DOMAIN, cloudId: JIRA_CLOUD_ID });
});

/** Verify credentials — called by the portal login form */
app.get("/api/me", async (req, res) => {
  try {
    const auth = getAuth(req);
    const me   = await jira("/myself", "GET", null, auth);
    res.json({ displayName: me.displayName, emailAddress: me.emailAddress, accountId: me.accountId });
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
  }
});

/**
 * Create a full Test Execution + all Test subtasks.
 * Body: { name, description?, fixVersion?, projectKey, tests: [{key, summary}] }
 */
app.post("/api/execution", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { name, description, fixVersion, projectKey = "QAT", tests = [] } = req.body || {};

  if (!name)         return res.status(400).json({ error: "name is required" });
  if (!tests.length) return res.status(400).json({ error: "tests array must not be empty" });

  // 1. Create Test Execution parent
  let execKey;
  try {
    const execFields = {
      project:   { key: projectKey },
      issuetype: { name: "Test Execution" },
      summary: name,
      ...(description ? {
        description: {
          type: "doc", version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: description }] }],
        },
      } : {}),
      ...(fixVersion ? { fixVersions: [{ name: fixVersion }] } : {}),
    };
    const exec = await jira("/issue", "POST", { fields: execFields }, auth);
    execKey = exec.key;
    console.log(`[+] ${execKey} created by ${req.headers["x-jira-email"]}`);
  } catch (e) {
    return res.status(e.status || 500).json({ error: `Failed to create execution: ${e.message}` });
  }

  // 2. Create Test subtasks sequentially
  const created = [];
  const failed  = [];

  for (const t of tests) {
    try {
      const issue = await jira("/issue", "POST", {
        fields: {
          project:   { key: projectKey },
          issuetype: { name: "Test" },
          summary:   t.summary,
          parent:    { key: execKey },
        },
      }, auth);
      created.push({ original: t.key, created: issue.key });
      console.log(`  ✓ ${issue.key} <- ${t.key}`);
    } catch (e) {
      failed.push({ original: t.key, error: e.message });
      console.warn(`  x ${t.key}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[done] ${execKey}: ${created.length}/${tests.length}`);

  res.json({
    execKey,
    execUrl: `https://${JIRA_DOMAIN}/browse/${execKey}`,
    created,
    failed,
    total: tests.length,
  });
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`IoT Proxy running on port ${PORT} — per-user credentials mode`);
});
