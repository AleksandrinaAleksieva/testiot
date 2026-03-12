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

// Transition IDs from "Open" status (confirmed via Jira API for QAT project)
const STATUS_TRANSITIONS = {
  passed:         "2",
  failed:         "3",
  skipped:        "4",
  not_applicable: "5",
  passed_remarks: "23",
  fixed:          "24",
};

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

// Required for ngrok — skips the browser warning interstitial page
app.use((_req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

function getAuth(req) {
  const email = req.headers["x-jira-email"];
  const token = req.headers["x-jira-token"];
  if (!email || !token) throw new Error("Missing x-jira-email or x-jira-token headers");
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

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

// ── Routes ──────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, domain: JIRA_DOMAIN, cloudId: JIRA_CLOUD_ID });
});

/** Verify credentials */
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
 * Get description of a single issue (used for the expand description feature).
 */
app.get("/api/issue/:key", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  try {
    const issue = await jira(`/issue/${req.params.key}?fields=summary,description`, "GET", null, auth);
    // description is renderedFields text or ADF — extract plain text
    const raw = issue.fields?.description;
    let description = "No description available.";
    if (raw) {
      if (typeof raw === "string") {
        description = raw;
      } else if (raw.content) {
        // ADF → extract text nodes recursively
        description = extractAdfText(raw);
      }
    }
    res.json({ key: issue.key, summary: issue.fields?.summary, description });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** Recursively extract plain text from Atlassian Document Format (ADF) */
function extractAdfText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "rule") return "\n---\n";
  const children = node.content || [];
  const childText = children.map(extractAdfText).join("");
  if (["paragraph","heading","listItem"].includes(node.type)) return childText + "\n";
  if (["bulletList","orderedList"].includes(node.type)) return childText;
  return childText;
}

/**
 * Load a Test Execution with all its subtasks (status + reason).
 * Used by the "Edit Execution" flow to pre-populate the UI.
 */
app.get("/api/execution/:key", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  try {
    // 1. Fetch the execution itself
    const exec = await jira(
      `/issue/${req.params.key}?fields=summary,description,fixVersions,status,issuetype,subtasks`,
      "GET", null, auth
    );

    if (exec.fields.issuetype?.name !== "Test Execution") {
      return res.status(400).json({ error: `${req.params.key} is not a Test Execution (it's a ${exec.fields.issuetype?.name})` });
    }

    // 2. Fetch each subtask in parallel (status + reason)
    const subtaskKeys = (exec.fields.subtasks || []).map(s => s.key);
    const subtaskDetails = await Promise.all(
      subtaskKeys.map(k =>
        jira(`/issue/${k}?fields=summary,status,customfield_12246`, "GET", null, auth)
          .then(d => ({
            key: d.key,
            summary: d.fields.summary,
            statusName: d.fields.status?.name || "Open",
            statusId: d.fields.status?.id || "1",
            reason: d.fields.customfield_12246 || "",
          }))
          .catch(() => null)
      )
    );

    // Map Jira status names → app status values
    const STATUS_NAME_MAP = {
      "🟢 Passed":            "passed",
      "🔴 Failed":            "failed",
      "🟡 Skipped":           "skipped",
      "⚪ Not applicable":    "not_applicable",
      "🟠Passed with remarks":"passed_remarks",
      "🔵Fixed":              "fixed",
      "Open":                 "not_applicable",
    };

    const tests = subtaskDetails
      .filter(Boolean)
      .map(t => ({
        key: t.key,
        summary: t.summary,
        status: STATUS_NAME_MAP[t.statusName] || "not_applicable",
        reason: t.reason,
      }));

    res.json({
      key: exec.key,
      summary: exec.fields.summary,
      fixVersion: exec.fields.fixVersions?.[0]?.name || "",
      tests,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/**
 * Update existing Test Execution subtasks — transition status + update reason.
 * Body: { tests: [{ key, status, reason }] }  (these are the EXISTING subtask keys)
 * Also updates the execution summary if provided.
 */
app.post("/api/execution/:key/update", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const execKey = req.params.key;
  const { name, tests = [] } = req.body || {};

  const updated = [];
  const failed  = [];

  // Optionally rename the execution
  if (name) {
    try {
      await jira(`/issue/${execKey}`, "PUT", { fields: { summary: name } }, auth);
      console.log(`[edit] Renamed ${execKey} → "${name}"`);
    } catch (e) {
      console.warn(`[edit] Rename failed: ${e.message}`);
    }
  }

  for (const t of tests) {
    try {
      // 1. Transition status
      const transitionId = STATUS_TRANSITIONS[t.status];
      if (transitionId) {
        // Need to get current transitions for this issue (status-dependent)
        const transData = await jira(`/issue/${t.key}/transitions`, "GET", null, auth);
        const available = transData.transitions || [];
        const match = available.find(tr => tr.id === transitionId);
        if (match) {
          await jira(`/issue/${t.key}/transitions`, "POST", { transition: { id: transitionId } }, auth);
        } else {
          // Try by name if ID not found
          const byName = available.find(tr =>
            tr.name.toLowerCase().includes(t.status.replace("_", " "))
          );
          if (byName) {
            await jira(`/issue/${t.key}/transitions`, "POST", { transition: { id: byName.id } }, auth);
          }
        }
      }

      // 2. Update reason field
      await jira(`/issue/${t.key}`, "PUT", {
        fields: { customfield_12246: t.reason || null },
      }, auth);

      updated.push(t.key);
      console.log(`  ✓ updated ${t.key} → ${t.status}`);
    } catch (e) {
      failed.push({ key: t.key, error: e.message });
      console.warn(`  x ${t.key}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 80));
  }

  res.json({ execKey, updated, failed });
});

/**
 * Create a full Test Execution + Test subtasks.
 * Also handles "edit existing execution" via parentKey field.
 * Body: {
 *   name, description?, fixVersion?, projectKey,
 *   parentKey?,   ← if set, adds tests to this existing execution
 *   tests: [{ key, summary, status, reason, addToTemplate?, templateKey? }]
 * }
 */
app.post("/api/execution", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const {
    name, description, fixVersion,
    projectKey = "QAT",
    parentKey,          // if present → edit mode (add to existing)
    tests = []
  } = req.body || {};

  if (!parentKey && !name) return res.status(400).json({ error: "name is required for new executions" });
  if (!tests.length)       return res.status(400).json({ error: "tests array must not be empty" });

  let execKey = parentKey || null;

  // 1. Create Test Execution parent (only in create mode)
  if (!parentKey) {
    try {
      const execFields = {
        project:   { key: projectKey },
        issuetype: { name: "Test Execution" },
        summary: name,
        // Only set description if user explicitly provided one (not the report)
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
  } else {
    console.log(`[edit] Adding tests to existing ${execKey} by ${req.headers["x-jira-email"]}`);
  }

  // 2. Create Test subtasks + transition status + optionally add to template
  const created = [];
  const failed  = [];

  for (const t of tests) {
    try {
      // Create the test subtask
      const testFields = {
        project:   { key: projectKey },
        issuetype: { name: "Test" },
        summary:   t.summary,
        parent:    { key: execKey },
        // Reason field (customfield_12246)
        ...(t.reason ? { customfield_12246: t.reason } : {}),
      };

      const issue = await jira("/issue", "POST", { fields: testFields }, auth);
      const newKey = issue.key;
      created.push({ original: t.key, created: newKey });
      console.log(`  ✓ ${newKey} <- ${t.key}`);

      // 2b. Transition the new issue to the selected status (if not "open")
      const transitionId = STATUS_TRANSITIONS[t.status];
      if (transitionId) {
        try {
          await jira(`/issue/${newKey}/transitions`, "POST", {
            transition: { id: transitionId },
          }, auth);
          console.log(`    → transitioned ${newKey} to ${t.status}`);
        } catch (te) {
          console.warn(`    ⚠ transition ${newKey} failed: ${te.message}`);
        }
      }

      // 2c. If addToTemplate, also create the test under the template epic
      if (t.addToTemplate && t.templateKey) {
        try {
          const tplFields = {
            project:   { key: projectKey },
            issuetype: { name: "Test" },
            summary:   t.summary,
            parent:    { key: t.templateKey },
          };
          const tplIssue = await jira("/issue", "POST", { fields: tplFields }, auth);
          console.log(`    + Added ${tplIssue.key} to template ${t.templateKey}`);
        } catch (te) {
          console.warn(`    ⚠ template add failed: ${te.message}`);
        }
      }

    } catch (e) {
      failed.push({ original: t.key, error: e.message });
      console.warn(`  x ${t.key}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 120));
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
 * Link two issues via a Jira link type.
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

/** Get fix versions for a project */
app.get("/api/versions", async (req, res) => {
  let auth;
  try { auth = getAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }
  try {
    const data = await jira(`/project/${req.query.projectKey || "QAT"}/versions`, "GET", null, auth);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`IoT Studio Proxy running on port ${PORT}`);
});
