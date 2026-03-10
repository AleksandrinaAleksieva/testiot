/**
 * IoT Studio — Backend Proxy Server
 *
 * Sits between the React portal and Atlassian's REST API.
 * Holds credentials server-side so the browser never has them,
 * and adds CORS headers so the portal can call it freely.
 *
 * Endpoints:
 *   GET  /health                  — liveness check
 *   GET  /api/me                  — verify credentials & return user info
 *   POST /api/issue               — create a single Jira issue
 *   POST /api/execution           — create a full execution + all subtasks in one call
 *   GET  /api/versions            — list fix versions for a project
 */

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const fetch    = require("node-fetch");

// ── Config ────────────────────────────────────────────────────────────────────
const {
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_CLOUD_ID,
  JIRA_DOMAIN,
  PORT = 3001,
  ALLOWED_ORIGINS = "http://localhost:3000",
} = process.env;

if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_CLOUD_ID) {
  console.error("❌  Missing required env vars. Copy .env.example → .env and fill it in.");
  process.exit(1);
}

const JIRA_BASE  = `https://api.atlassian.com/ex/jira/${JIRA_CLOUD_ID}/rest/api/3`;
const AUTH_HEADER = "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();

app.use(express.json());

const origins = ALLOWED_ORIGINS.split(",").map(o => o.trim());
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || origins.includes("*") || origins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── Atlassian helper ──────────────────────────────────────────────────────────
async function jira(path, method = "GET", body = null) {
  const res = await fetch(`${JIRA_BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH_HEADER,
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
      data.errors  ? Object.values(data.errors).join(", ") :
      data.errorMessages?.join(", ") ||
      data.message  || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.jiraData = data;
    throw err;
  }
  return data;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** Health check */
app.get("/health", (_req, res) => {
  res.json({ ok: true, domain: JIRA_DOMAIN, cloudId: JIRA_CLOUD_ID });
});

/** Verify credentials — returns the acting user */
app.get("/api/me", async (_req, res) => {
  try {
    const me = await jira("/myself");
    res.json({ displayName: me.displayName, emailAddress: me.emailAddress, accountId: me.accountId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/**
 * Create a single Jira issue.
 * Body: { summary, issueTypeName, projectKey, parentKey?, description?, fixVersion? }
 */
app.post("/api/issue", async (req, res) => {
  const { summary, issueTypeName, projectKey, parentKey, description, fixVersion } = req.body || {};

  if (!summary || !issueTypeName || !projectKey) {
    return res.status(400).json({ error: "summary, issueTypeName and projectKey are required" });
  }

  const fields = {
    project:   { key: projectKey },
    issuetype: { name: issueTypeName },
    summary,
    ...(description ? {
      description: {
        type: "doc", version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text: description }] }],
      },
    } : {}),
    ...(parentKey  ? { parent: { key: parentKey } } : {}),
    ...(fixVersion ? { fixVersions: [{ name: fixVersion }] } : {}),
  };

  try {
    const data = await jira("/issue", "POST", { fields });
    res.json({ key: data.key, id: data.id });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, detail: e.jiraData });
  }
});

/**
 * Create a full Test Execution with subtasks in one shot.
 *
 * Body: {
 *   name:        string  — execution summary
 *   description: string? — optional description
 *   fixVersion:  string? — optional fix version name
 *   projectKey:  string  — e.g. "QAT"
 *   tests: Array<{ key: string, summary: string }> — tests to create as subtasks
 * }
 *
 * Returns: {
 *   execKey:  string,
 *   created:  [{ original, created }],
 *   failed:   [{ original, error }],
 *   total:    number
 * }
 */
app.post("/api/execution", async (req, res) => {
  const { name, description, fixVersion, projectKey = "QAT", tests = [] } = req.body || {};

  if (!name) return res.status(400).json({ error: "name is required" });
  if (!tests.length) return res.status(400).json({ error: "tests array must not be empty" });

  // 1. Create the Test Execution parent
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
    const exec = await jira("/issue", "POST", { fields: execFields });
    execKey = exec.key;
    console.log(`[+] Execution created: ${execKey}`);
  } catch (e) {
    return res.status(e.status || 500).json({ error: `Failed to create execution: ${e.message}` });
  }

  // 2. Create subtasks sequentially (avoid hammering Atlassian rate limits)
  const created = [];
  const failed  = [];

  for (const t of tests) {
    try {
      const testFields = {
        project:   { key: projectKey },
        issuetype: { name: "Test" },
        summary:   t.summary,
        parent:    { key: execKey },
      };
      const issue = await jira("/issue", "POST", { fields: testFields });
      created.push({ original: t.key, created: issue.key });
      console.log(`  ✓ ${issue.key}  ← ${t.key}`);
    } catch (e) {
      failed.push({ original: t.key, error: e.message });
      console.warn(`  ✗ ${t.key}: ${e.message}`);
    }
    // Small pause — Atlassian allows ~10 req/s on Cloud; this keeps us safe
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[✓] Done — ${execKey}: ${created.length}/${tests.length} created`);

  res.json({
    execKey,
    execUrl: `https://${JIRA_DOMAIN}/browse/${execKey}`,
    created,
    failed,
    total: tests.length,
  });
});

/**
 * List fix versions for a project.
 * GET /api/versions?project=QAT
 */
app.get("/api/versions", async (req, res) => {
  const project = req.query.project || "QAT";
  try {
    const data = await jira(`/project/${project}/versions`);
    res.json(data.map(v => ({ id: v.id, name: v.name, released: v.released })));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║         IoT Studio — Proxy Server           ║
╠══════════════════════════════════════════════╣
║  Listening on  http://localhost:${PORT}          ║
║  Jira domain   ${JIRA_DOMAIN.padEnd(30)} ║
║  Cloud ID      ${JIRA_CLOUD_ID.substring(0, 8)}…                       ║
║  Allowed from  ${origins[0].padEnd(30)} ║
╚══════════════════════════════════════════════╝
  `);
});
