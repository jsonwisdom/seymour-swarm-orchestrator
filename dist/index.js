var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/comms-directory.ts
var COMMS_DIRECTORY = {
  schema: "SEYMOUR_COMMS_DIRECTORY_V1",
  mode: "DESIGN_ONLY",
  connectedGrokAgents: 0,
  connectedServiceBindings: 0,
  historicalSeats: { total: 27, bound: 0, named: [
    { seat: "01", role: "Librarian" },
    { seat: "02", role: "Receipt Clerk" },
    { seat: "03", role: "Family Continuity" },
    { seat: "04", role: "Story Weaver" },
    { seat: "05", role: "Ops/Deploy" },
    { seat: "06", role: "Operator Mirror" }
  ], unnamed: 21 },
  federation: [
    { name: "Julie Powers", responsibility: "Federation coordination" },
    { name: "Sentinel", responsibility: "Permission and safety review" },
    { name: "Auditor", responsibility: "Receipts and accountability" },
    { name: "Historian", responsibility: "Timeline and evidence recovery" },
    { name: "Recon", responsibility: "Source exploration" },
    { name: "Engineer", responsibility: "Code and runtime verification" },
    { name: "Press", responsibility: "Drafting; publication gated" },
    { name: "Colonel Jessup", responsibility: "Handoff gate coordination" },
    { name: "Gambit Zero x402 Bot", responsibility: "Payment research; spending gated" },
    { name: "Grok Bot", responsibility: "Historical Grok role (distinct from legacy Grok Bot)" }
  ].map((agent) => ({ ...agent, connected: false, endpointVerified: false })),
  transports: {
    internal: "Cloudflare Service Bindings RPC \u2014 NOT CONFIGURED",
    asynchronous: "Cloudflare Queues \u2014 BUS_QUEUE NOT CONFIGURED",
    grok: "Authenticated adapter \u2014 NOT CONFIGURED"
  },
  next: "Verify bot endpoints, authenticate, test messages, record delivery receipts; do not interpret acknowledgments as completion."
};

// src/mission-state.ts
import { DurableObject } from "cloudflare:workers";
var VALID = /* @__PURE__ */ new Set(["STARTED", "IN_PROGRESS", "DELIVERED", "HOLD", "FAILED"]);
var MAX_BYTES = 64 * 1024;
var MissionState = class extends DurableObject {
  static {
    __name(this, "MissionState");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        mission_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_step TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        note TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON checkpoints(status, updated_at);
    `);
  }
  async save(checkpoint) {
    if (!checkpoint || typeof checkpoint.missionId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(checkpoint.missionId) || !VALID.has(checkpoint.status) || typeof checkpoint.lastStep !== "string" || checkpoint.lastStep.length > 512 || typeof checkpoint.note !== "string" || checkpoint.note.length > 4096) {
      throw new Error("INVALID_CHECKPOINT");
    }
    let payload;
    try {
      payload = JSON.stringify(checkpoint.payload ?? null);
    } catch {
      throw new Error("INVALID_PAYLOAD");
    }
    if (new TextEncoder().encode(payload).byteLength > MAX_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `
      INSERT INTO checkpoints(mission_id,status,last_step,payload,timestamp,note,revision,updated_at)
      VALUES(?,?,?,?,?,?,1,?)
      ON CONFLICT(mission_id) DO UPDATE SET
        status=excluded.status,last_step=excluded.last_step,payload=excluded.payload,
        timestamp=excluded.timestamp,note=excluded.note,
        revision=checkpoints.revision+1,updated_at=excluded.updated_at
    `,
      checkpoint.missionId,
      checkpoint.status,
      checkpoint.lastStep,
      payload,
      now,
      checkpoint.note,
      now
    );
    const result = this.ctx.storage.sql.exec(
      "SELECT revision FROM checkpoints WHERE mission_id = ?",
      checkpoint.missionId
    ).one();
    return { saved: true, missionId: checkpoint.missionId, revision: result.revision, updatedAt: now };
  }
  async load(missionId) {
    const rows = this.ctx.storage.sql.exec(
      "SELECT * FROM checkpoints WHERE mission_id = ?",
      missionId
    ).toArray();
    const r = rows[0];
    if (!r) return null;
    return {
      missionId: String(r.mission_id),
      status: r.status,
      lastStep: String(r.last_step),
      payload: JSON.parse(String(r.payload)),
      timestamp: Number(r.timestamp),
      note: String(r.note),
      revision: Number(r.revision)
    };
  }
  async unfinished(limit = 100) {
    const n = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 100;
    return this.ctx.storage.sql.exec(
      "SELECT mission_id,status,last_step,updated_at,revision FROM checkpoints WHERE status IN ('STARTED','IN_PROGRESS','HOLD','FAILED') ORDER BY updated_at DESC LIMIT ?",
      n
    ).toArray().map((r) => ({
      missionId: String(r.mission_id),
      status: String(r.status),
      lastStep: String(r.last_step),
      timestamp: Number(r.updated_at),
      revision: Number(r.revision)
    }));
  }
};

// src/task-ledger.ts
import { DurableObject as DurableObject2 } from "cloudflare:workers";
var TaskLedger = class extends DurableObject2 {
  static {
    __name(this, "TaskLedger");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        requestId TEXT,
        type TEXT,
        query TEXT,
        provenance TEXT,
        dependencies TEXT, -- JSON
        costBudget INTEGER,
        outcome TEXT,
        result TEXT, -- JSON
        hash TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_hash ON tasks(hash);
      CREATE INDEX IF NOT EXISTS idx_request ON tasks(requestId);
    `);
  }
  async createOrReuseTask(task) {
    const existing = this.ctx.storage.sql.exec(
      "SELECT * FROM tasks WHERE hash = ?",
      task.hash
    ).toArray()[0];
    if (existing) {
      return this.rowToTask(existing);
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const full = {
      ...task,
      id,
      outcome: task.outcome || "PENDING",
      createdAt: now,
      updatedAt: now
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO tasks (id, requestId, type, query, provenance, dependencies, costBudget, outcome, result, hash, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      full.id,
      full.requestId,
      full.type,
      full.query,
      full.provenance,
      JSON.stringify(full.dependencies),
      full.costBudget,
      full.outcome,
      full.result ? JSON.stringify(full.result) : null,
      full.hash,
      full.createdAt,
      full.updatedAt
    );
    return full;
  }
  async updateOutcome(id, outcome, result) {
    this.ctx.storage.sql.exec(
      "UPDATE tasks SET outcome = ?, result = ?, updatedAt = ? WHERE id = ?",
      outcome,
      result ? JSON.stringify(result) : null,
      Date.now(),
      id
    );
  }
  async getProgressSummary(requestId) {
    const rows = this.ctx.storage.sql.exec(
      "SELECT outcome, COUNT(*) AS count FROM tasks WHERE requestId = ? GROUP BY outcome",
      requestId
    ).toArray();
    const stats = { total: 0, pass: 0, fail: 0, unknown: 0, pending: 0 };
    for (const row of rows) {
      const n = Number(row.count);
      stats.total += n;
      if (row.outcome === "PASS") stats.pass += n;
      else if (row.outcome === "FAIL") stats.fail += n;
      else if (row.outcome === "UNKNOWN") stats.unknown += n;
      else stats.pending += n;
    }
    return stats;
  }
  async getTasksForRequest(requestId) {
    const rows = this.ctx.storage.sql.exec(
      "SELECT * FROM tasks WHERE requestId = ?",
      requestId
    ).toArray();
    return rows.map(this.rowToTask);
  }
  async getEvidenceGraph(requestId) {
    const tasks = await this.getTasksForRequest(requestId);
    const stats = {
      total: tasks.length,
      pass: tasks.filter((t) => t.outcome === "PASS").length,
      fail: tasks.filter((t) => t.outcome === "FAIL").length,
      unknown: tasks.filter((t) => t.outcome === "UNKNOWN").length,
      pending: tasks.filter((t) => t.outcome === "PENDING").length
    };
    return { tasks, stats };
  }
  rowToTask(row) {
    return {
      id: row.id,
      requestId: row.requestId,
      type: row.type,
      query: row.query,
      provenance: row.provenance,
      dependencies: JSON.parse(row.dependencies || "[]"),
      costBudget: row.costBudget,
      outcome: row.outcome,
      result: row.result ? JSON.parse(row.result) : void 0,
      hash: row.hash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
};

// src/investigation-workflow.ts
import { WorkflowEntrypoint } from "cloudflare:workers";
var InvestigationWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "InvestigationWorkflow");
  }
  async run(event, step) {
    const { requestId, question } = event.payload;
    const stub = this.env.TASK_LEDGER.getByName(requestId);
    await step.do("record-start", async () => ({
      requestId,
      question,
      startedAt: Date.now(),
      note: "No conclusions are authorized by Workflow execution."
    }));
    const initial = await step.do("initial-progress", () => stub.getProgressSummary(requestId));
    let signal = "already-settled";
    if (initial.total > 0 && initial.pending > 0) {
      try {
        const notification = await step.waitForEvent(
          "wait-for-tasks-settled",
          { type: "tasks-settled", timeout: "10 minutes" }
        );
        if (notification.payload?.requestId !== requestId || notification.payload?.source !== "task-queue" || notification.payload?.kind !== "tasks-settled") {
          signal = "timeout";
        } else {
          signal = "tasks-settled";
        }
      } catch {
        signal = "timeout";
      }
    }
    return step.do("final-reconciliation", async () => {
      const finalStats = await stub.getProgressSummary(requestId);
      return {
        requestId,
        question,
        finalStats,
        signal,
        completedAt: Date.now(),
        status: finalStats.total > 0 && finalStats.pending === 0 ? "COMPLETE" : "PARTIAL",
        note: "COMPLETE means tasks settled, not claims verified. Simulated outcomes are not factual PASS. Human review required."
      };
    });
  }
};

// src/control-desk.ts
async function handleControlDesk(request) {
  if (request.method !== "POST") {
    return new Response("POST /control-desk with { mission, scope?, roles?, dryRun? }", { status: 405 });
  }
  const body = await request.json();
  if (!body.mission || body.mission.trim().length === 0) {
    return Response.json({
      status: "REJECTED",
      note: "Mission text required"
    }, { status: 400 });
  }
  const missionId = crypto.randomUUID();
  const receipt = {
    missionId,
    status: body.dryRun === false ? "HOLD" : "ACCEPTED",
    timestamp: Date.now(),
    note: body.dryRun === false ? "Live execution requires explicit human authorization. Defaulting to dry-run acceptance." : "Mission accepted under constitutional autonomy (research / draft / test / log). Production and credentials remain gated.",
    next: "Internal delegation and drafting may proceed. Review output in control desk."
  };
  return Response.json(receipt);
}
__name(handleControlDesk, "handleControlDesk");

// src/message-bus.ts
async function sendDirect(env, toBinding, payload) {
  return Response.json({
    status: "HOLD",
    note: "Service Binding not yet configured. Declare in wrangler.jsonc when agents are available.",
    to: toBinding,
    payload
  }, { status: 501 });
}
__name(sendDirect, "sendDirect");
async function enqueueAsync(env, msg) {
  if (!env.BUS_QUEUE) {
    return { error: "BUS_QUEUE not bound" };
  }
  const full = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: Date.now()
  };
  await env.BUS_QUEUE.send(full);
  return { id: full.id };
}
__name(enqueueAsync, "enqueueAsync");
async function updateSharedState(env, key, value) {
  if (!env.MISSION_STATE) {
    return new Response("MISSION_STATE Durable Object not bound", { status: 501 });
  }
  return Response.json({
    status: "HOLD",
    note: "Durable Object state update stubbed. Implement MissionState class when ready.",
    key,
    value
  }, { status: 501 });
}
__name(updateSharedState, "updateSharedState");

// src/recovery.ts
var REGISTRY = "seymour-mission-registry-v1";
function registry(env) {
  return env.MISSION_STATE?.getByName(REGISTRY);
}
__name(registry, "registry");
async function saveCheckpoint(env, checkpoint) {
  const stub = registry(env);
  if (!stub) return { saved: false, note: "MISSION_STATE not bound" };
  return stub.save(checkpoint);
}
__name(saveCheckpoint, "saveCheckpoint");
async function loadCheckpoint(env, missionId) {
  const stub = registry(env);
  if (!stub) return null;
  return stub.load(missionId);
}
__name(loadCheckpoint, "loadCheckpoint");
async function listUnfinished(env) {
  const stub = registry(env);
  if (!stub) return [];
  return stub.unfinished();
}
__name(listUnfinished, "listUnfinished");

// src/index.ts
var DEFAULT_LOGICAL_TASKS = 73e3;
var TASKS_PER_BATCH = 270;
var AGENT_TYPES = ["source", "audit", "math", "legal", "replay", "receipt"];
function isAllowlisted(email, allowlist) {
  if (!email || !allowlist) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.split(",").some((s) => s.trim().toLowerCase() === normalized);
}
__name(isAllowlisted, "isAllowlisted");
function hasRoutePermission(pathname, email, env) {
  if (!isAllowlisted(email, env.ACCESS_ALLOWLIST)) return false;
  const recovery = pathname === "/recovery/save" || pathname === "/recovery/unfinished" || pathname.startsWith("/recovery/load/");
  if (recovery) return true;
  const orchestration = pathname === "/investigate" || pathname === "/control-desk" || pathname.startsWith("/graph/") || pathname.startsWith("/workflow/") || pathname.startsWith("/bus/");
  return orchestration && isAllowlisted(email, env.ACCESS_ORCHESTRATION_ALLOWLIST);
}
__name(hasRoutePermission, "hasRoutePermission");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ service: "seymour-swarm-orchestrator", status: "UP", verified: "transport-only", version: "0.4" });
    }
    const isPublic = url.pathname === "/comms/who" && request.method === "GET" || url.pathname === "/simulator/status" && request.method === "GET";
    if (!isPublic) {
      const hasAccess = !!ctx.access;
      const hasBearer = !!(env.CONTROL_DESK_TOKEN && request.headers.get("Authorization") === "Bearer " + env.CONTROL_DESK_TOKEN);
      if (!hasAccess && !hasBearer) {
        return Response.json(
          { error: "AUTH_REQUIRED", note: "Cloudflare Access or authenticated private gateway required." },
          { status: 401 }
        );
      }
      if (hasAccess && ctx.access) {
        let email;
        try {
          const identity = await ctx.access.getIdentity();
          email = identity?.email;
        } catch {
          return Response.json({ error: "ACCESS_IDENTITY_UNAVAILABLE" }, { status: 403 });
        }
        if (!hasRoutePermission(url.pathname, email, env)) {
          return Response.json(
            { error: "FORBIDDEN", note: "Identity lacks permission for this operation." },
            { status: 403 }
          );
        }
      }
    }
    if (url.pathname === "/comms/who" && request.method === "GET") {
      return Response.json(COMMS_DIRECTORY);
    }
    if (url.pathname === "/control-desk" && request.method === "POST") {
      return handleControlDesk(request);
    }
    if (url.pathname === "/bus/enqueue" && request.method === "POST") {
      const body = await request.json();
      const result = await enqueueAsync(env, {
        from: body.from || "control-desk",
        to: body.to || "unknown",
        type: "async",
        payload: body.payload
      });
      return Response.json(result);
    }
    if (url.pathname === "/bus/direct" && request.method === "POST") {
      const body = await request.json();
      return sendDirect(env, body.toBinding || "EXAMPLE_AGENT", body.payload);
    }
    if (url.pathname === "/bus/state" && request.method === "POST") {
      const body = await request.json();
      return updateSharedState(env, body.key || "default", body.value);
    }
    if (url.pathname === "/recovery/save" && request.method === "POST") {
      const body = await request.json();
      try {
        const result = await saveCheckpoint(env, body);
        return Response.json(result, { status: result.saved ? 200 : 503 });
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "SAVE_FAILED" }, { status: 400 });
      }
    }
    if (url.pathname.startsWith("/recovery/load/") && request.method === "GET") {
      const missionId = url.pathname.split("/")[3];
      const checkpoint = await loadCheckpoint(env, missionId);
      return Response.json(checkpoint ?? { note: "No checkpoint found or state not bound" });
    }
    if (url.pathname === "/recovery/unfinished" && request.method === "GET") {
      const ids = await listUnfinished(env);
      return Response.json({ unfinished: ids });
    }
    if (url.pathname === "/investigate" && request.method === "POST") {
      const body = await request.json();
      const requestId = body.requestId || crypto.randomUUID();
      const logicalCount = Math.min(body.logicalTaskCount ?? DEFAULT_LOGICAL_TASKS, 1e5);
      const dryRun = body.dryRun === true;
      if (!dryRun && logicalCount > 3e3) {
        return Response.json({
          error: "FREE_TIER_EXECUTION_GUARD",
          message: "Live execution capped at 3,000 tasks/request (~9,000 Queue operations). Use dryRun:true for the 73,000-task simulator.",
          logicalTasks: logicalCount,
          note: "This is a design guard, not a verified account-level quota check."
        }, { status: 422 });
      }
      const useWorkflow = body.useWorkflow === true;
      const stub = env.TASK_LEDGER.getByName(requestId);
      const logicalTasks = [];
      for (let i = 0; i < logicalCount; i++) {
        const agentType = AGENT_TYPES[i % AGENT_TYPES.length];
        const subQuery = `${body.question} :: facet-${i % 1e3} :: ${agentType}`;
        logicalTasks.push({
          type: agentType,
          query: subQuery,
          provenance: "user-request",
          dependencies: i > 10 ? [`dep-${Math.floor(i / 50)}`] : [],
          costBudget: i % 5 + 1,
          hash: await hashStr(subQuery + agentType)
        });
      }
      const created = [];
      const batches = [];
      let currentBatch = [];
      for (const t of logicalTasks) {
        const task = await stub.createOrReuseTask({
          requestId,
          type: t.type,
          query: t.query,
          provenance: t.provenance,
          dependencies: t.dependencies,
          costBudget: t.costBudget,
          hash: t.hash
        });
        created.push(task);
        currentBatch.push({
          taskId: task.id,
          requestId,
          type: task.type,
          query: task.query,
          batchHint: Math.floor(created.length / TASKS_PER_BATCH)
        });
        if (currentBatch.length >= TASKS_PER_BATCH) {
          batches.push(currentBatch);
          currentBatch = [];
        }
      }
      if (currentBatch.length > 0) batches.push(currentBatch);
      let workflowInstanceId;
      if (useWorkflow && !dryRun) {
        const instance = await env.INVESTIGATION_WORKFLOW.create({
          id: `inv-${requestId}`,
          params: { requestId, question: body.question, logicalTaskCount: logicalCount }
        });
        workflowInstanceId = instance.id;
      }
      if (!dryRun) {
        for (const batch of batches) {
          for (let i = 0; i < batch.length; i += 100) {
            const sub = batch.slice(i, i + 100);
            await env.TASK_QUEUE.sendBatch(sub.map((msg) => ({ body: msg })));
          }
        }
      }
      const requiredBatches = Math.ceil(logicalCount / TASKS_PER_BATCH);
      const estimatedOps = logicalCount * 3;
      const freeTierOpsPerDay = 1e4;
      return Response.json({
        requestId,
        workflowInstanceId,
        message: dryRun ? "Dry-run complete. No queue messages sent." : useWorkflow ? "Investigation started with Workflow for long-running monitoring. Tasks tracked in durable ledger. Batches queued." : "Investigation started. Tasks tracked in durable ledger. Batches queued.",
        simulator: {
          logicalTasks: logicalCount,
          tasksPerBatch: TASKS_PER_BATCH,
          requiredBatches,
          uniqueTasksCreated: created.length,
          estimatedQueueOps: estimatedOps,
          freeTierOpsRemainingEstimate: Math.max(0, freeTierOpsPerDay - estimatedOps),
          note: "Conceptual batching. Actual execution respects CPU, subrequest, storage, and queue limits. ~3 ops per message. Workflow steps counted separately (free tier: 3,000/day). Simulator outcomes are not evidence of real agent research."
        },
        note: "No Cloudflare billing upgrade or deployment performed. Read-only by default. Humans retain publication/legal authority."
      });
    }
    if (url.pathname.startsWith("/graph/") && request.method === "GET") {
      const requestId = url.pathname.split("/")[2];
      const stub = env.TASK_LEDGER.getByName(requestId);
      const graph = await stub.getEvidenceGraph(requestId);
      return Response.json({
        requestId,
        ...graph,
        architecture: "SEYMOUR SWARM v0.2 - JSON Evidence Graph: Deduplicate \u2022 Verify \u2022 Reconcile \u2022 Replay"
      });
    }
    if (url.pathname.startsWith("/workflow/") && request.method === "GET") {
      const instanceId = url.pathname.split("/")[2];
      try {
        const instance = await env.INVESTIGATION_WORKFLOW.get(instanceId);
        const status = await instance.status();
        return Response.json({ instanceId, status });
      } catch (e) {
        return Response.json({ error: "Workflow instance not found or not yet available", instanceId }, { status: 404 });
      }
    }
    if (url.pathname === "/simulator/status") {
      return Response.json({
        version: "0.4-recovery",
        defaults: {
          logicalTasks: DEFAULT_LOGICAL_TASKS,
          tasksPerBatch: TASKS_PER_BATCH,
          requiredBatches: Math.ceil(DEFAULT_LOGICAL_TASKS / TASKS_PER_BATCH),
          agentTypes: AGENT_TYPES
        },
        freeTier: {
          queueOpsPerDay: 1e4,
          workflowStepsPerDay: 3e3,
          concurrentWorkflowInstances: 100,
          note: "Messages typically consume 3 operations each (write/read/delete). Workflow steps are billed separately."
        }
      });
    }
    return new Response("SEYMOUR SWARM ORCHESTRATOR v0.4\nPOST /control-desk {mission, scope?, roles?, dryRun?}\nPOST /bus/enqueue {from, to, payload}\nPOST /bus/direct {toBinding, payload}\nPOST /bus/state {key, value}\nPOST /recovery/save {missionId, status, lastStep, payload, timestamp, note}\nGET /recovery/load/{missionId}\nGET /recovery/unfinished\nPOST /investigate {question, logicalTaskCount?, dryRun?, useWorkflow?}\nGET /graph/{requestId}\nGET /workflow/{instanceId}\nGET /simulator/status", { status: 200 });
  },
  async queue(batch, env) {
    const touched = /* @__PURE__ */ new Set();
    for (const msg of batch.messages) {
      const { taskId, requestId, type, query } = msg.body;
      const stub = env.TASK_LEDGER.getByName(requestId);
      const outcome = "UNKNOWN";
      await stub.updateOutcome(taskId, outcome, {
        simulated: true,
        note: "Simulator outcome. Not evidence of real agent execution.",
        processedInBatch: true
      });
      msg.ack();
      touched.add(requestId);
    }
    for (const requestId of touched) {
      const stub = env.TASK_LEDGER.getByName(requestId);
      const stats = await stub.getProgressSummary(requestId);
      if (stats.total > 0 && stats.pending === 0) {
        try {
          const instance = await env.INVESTIGATION_WORKFLOW.get(`inv-${requestId}`);
          await instance.sendEvent({
            type: "tasks-settled",
            payload: { requestId, source: "task-queue", kind: "tasks-settled" }
          });
        } catch {
        }
      }
    }
  }
};
async function hashStr(s) {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashStr, "hashStr");
export {
  InvestigationWorkflow,
  MissionState,
  TaskLedger,
  index_default as default,
  hasRoutePermission
};
//# sourceMappingURL=index.js.map
