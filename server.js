/**
 * Xray Studio — Backend Proxy Server
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
      // Build description from status + comment if provided
      const statusLabel = {
        passed:          "✅ PASSED",
        passed_remarks:  "✅ PASSED with remarks",
        failed:          "❌ FAILED",
        fixed:           "🔧 FIXED",
        skipped:         "⏭ SKIPPED",
        not_applicable:  "N/A",
      }[t.status] || "N/A";
      const descText = t.comment
        ? `${statusLabel}\n\n${t.comment}`
        : statusLabel;

      const issue = await jira("/issue", "POST", {
        fields: {
          project:   { key: projectKey },
          issuetype: { name: "Test" },
          summary:   t.summary,
          parent:    { key: execKey },
          description: {
            type: "doc", version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: descText }] }],
          },
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

/**
 * Create a single issue (e.g. Test Report task).
 * Body: { summary, issueTypeName, projectKey, description? }
 */
app.post("/api/issue", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { summary, issueTypeName = "Task", projectKey = "QAT", description } = req.body || {};
  if (!summary) return res.status(400).json({ error: "summary is required" });

  try {
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
    };
    const issue = await jira("/issue", "POST", { fields }, auth);
    console.log(`[+] Issue ${issue.key} created`);
    res.json({ key: issue.key, url: `https://${JIRA_DOMAIN}/browse/${issue.key}` });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/**
 * Post a comment to an existing issue.
 * Body: { issueKey, body }
 */
app.post("/api/comment", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { issueKey, body } = req.body || {};
  if (!issueKey || !body) return res.status(400).json({ error: "issueKey and body are required" });

  try {
    await jira(`/issue/${issueKey}/comment`, "POST", {
      body: {
        type: "doc", version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
      },
    }, auth);
    console.log(`[comment] → ${issueKey}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/**
 * Body: { inwardKey, outwardKey, linkType }
 */
app.post("/api/link", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { inwardKey, outwardKey, linkType = "Relates" } = req.body || {};
  if (!inwardKey || !outwardKey) return res.status(400).json({ error: "inwardKey and outwardKey are required" });

  try {
    await jira("/issueLink", "POST", {
      type:         { name: linkType },
      inwardIssue:  { key: inwardKey },
      outwardIssue: { key: outwardKey },
    }, auth);
    console.log(`[link] ${inwardKey} "${linkType}" ${outwardKey}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Xray Proxy running on port ${PORT} — per-user credentials mode`);
});
