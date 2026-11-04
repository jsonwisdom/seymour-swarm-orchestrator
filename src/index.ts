import { COMMS_DIRECTORY } from "./comms-directory";
import { MissionState } from "./mission-state";
import { TaskLedger, Task } from "./task-ledger";
import { InvestigationWorkflow } from "./investigation-workflow";
import { handleControlDesk } from "./control-desk";
import { enqueueAsync, sendDirect, updateSharedState } from "./message-bus";
import { saveCheckpoint, loadCheckpoint, listUnfinished, MissionCheckpoint } from "./recovery";

export interface Env {
  TASK_LEDGER: DurableObjectNamespace<TaskLedger>;
  TASK_QUEUE: Queue;
  INVESTIGATION_WORKFLOW: Workflow;
  BUS_QUEUE?: Queue;
  MISSION_STATE?: DurableObjectNamespace<MissionState>;
  CONTROL_DESK_TOKEN?: string;
  // Comma-separated emails allowed to perform privileged operations.
  // Example: "jason@example.com,operator@example.com"
  ACCESS_ALLOWLIST?: string;
}

const DEFAULT_LOGICAL_TASKS = 73000;
const TASKS_PER_BATCH = 270;
const AGENT_TYPES = ["source", "audit", "math", "legal", "replay", "receipt"] as const;

function isAllowlisted(email: string | undefined, allowlist: string | undefined): boolean {
  if (!email || !allowlist) return false;
  const allowed = allowlist.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

function hasRoutePermission(pathname: string, email: string | undefined, allowlist: string | undefined): boolean {
  // Until a full role system exists, allowlisted operators may access all private routes.
  // Non-allowlisted Access identities are denied.
  if (!isAllowlisted(email, allowlist)) return false;
  return true;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Public discovery routes — no authentication required.
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({service:"seymour-swarm-orchestrator",status:"UP",verified:"transport-only",version:"0.4"});
    }
    const isPublic = (url.pathname === "/comms/who" && request.method === "GET") ||
      (url.pathname === "/simulator/status" && request.method === "GET");

    // Private routes require verified authentication AND authorization.
    // Prefer Cloudflare Access (ctx.access) when present.
    // Fall back to CONTROL_DESK_TOKEN until Access is fully activated and tested.
    // Never trust client-supplied headers alone.
    if (!isPublic) {
      const hasAccess = !!ctx.access;
      const hasBearer = !!(env.CONTROL_DESK_TOKEN &&
        request.headers.get("Authorization") === "Bearer " + env.CONTROL_DESK_TOKEN);

      if (!hasAccess && !hasBearer) {
        return Response.json(
          {error:"AUTH_REQUIRED",note:"Cloudflare Access or authenticated private gateway required."},
          {status:401}
        );
      }

      // Authorization: Access identity must be on the explicit allowlist.
      // Bearer-token callers are treated as the configured operator (no separate identity).
      if (hasAccess && ctx.access) {
        const email = ctx.access.userEmail;
        if (!hasRoutePermission(url.pathname, email, env.ACCESS_ALLOWLIST)) {
          return Response.json(
            {error:"FORBIDDEN",note:"Identity not authorized for this operation."},
            {status:403}
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
      const body = await request.json() as any;
      const result = await enqueueAsync(env, {
        from: body.from || "control-desk",
        to: body.to || "unknown",
        type: "async",
        payload: body.payload,
      });
      return Response.json(result);
    }

    if (url.pathname === "/bus/direct" && request.method === "POST") {
      const body = await request.json() as any;
      return sendDirect(env, body.toBinding || "EXAMPLE_AGENT", body.payload);
    }

    if (url.pathname === "/bus/state" && request.method === "POST") {
      const body = await request.json() as any;
      return updateSharedState(env, body.key || "default", body.value);
    }

    if (url.pathname === "/recovery/save" && request.method === "POST") {
      const body = await request.json() as MissionCheckpoint;
      try {
        const result = await saveCheckpoint(env, body);
        return Response.json(result, {status: result.saved ? 200 : 503});
      } catch (e) {
        return Response.json({error: e instanceof Error ? e.message : "SAVE_FAILED"}, {status:400});
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
      const body = await request.json() as { 
        question: string; 
        requestId?: string; 
        logicalTaskCount?: number; 
        dryRun?: boolean;
        useWorkflow?: boolean;
      };
      const requestId = body.requestId || crypto.randomUUID();
      const logicalCount = Math.min(body.logicalTaskCount ?? DEFAULT_LOGICAL_TASKS, 100000);
      const dryRun = body.dryRun === true;
      if (!dryRun && logicalCount > 3000) {
        return Response.json({
          error: "FREE_TIER_EXECUTION_GUARD",
          message: "Live execution capped at 3,000 tasks/request (~9,000 Queue operations). Use dryRun:true for the 73,000-task simulator.",
          logicalTasks: logicalCount,
          note: "This is a design guard, not a verified account-level quota check."
        }, { status: 422 });
      }
      const useWorkflow = body.useWorkflow === true;
      const stub = env.TASK_LEDGER.getByName(requestId);

      const logicalTasks: Partial<Task>[] = [];
      for (let i = 0; i < logicalCount; i++) {
        const agentType = AGENT_TYPES[i % AGENT_TYPES.length];
        const subQuery = `${body.question} :: facet-${i % 1000} :: ${agentType}`;
        logicalTasks.push({
          type: agentType,
          query: subQuery,
          provenance: "user-request",
          dependencies: i > 10 ? [`dep-${Math.floor(i / 50)}`] : [],
          costBudget: (i % 5) + 1,
          hash: await hashStr(subQuery + agentType),
        });
      }

      const created: Task[] = [];
      const batches: any[][] = [];
      let currentBatch: any[] = [];

      for (const t of logicalTasks) {
        const task = await stub.createOrReuseTask({
          requestId,
          type: t.type!,
          query: t.query!,
          provenance: t.provenance!,
          dependencies: t.dependencies!,
          costBudget: t.costBudget!,
          hash: t.hash!,
        });
        created.push(task);

        currentBatch.push({
          taskId: task.id,
          requestId,
          type: task.type,
          query: task.query,
          batchHint: Math.floor(created.length / TASKS_PER_BATCH),
        });

        if (currentBatch.length >= TASKS_PER_BATCH) {
          batches.push(currentBatch);
          currentBatch = [];
        }
      }
      if (currentBatch.length > 0) batches.push(currentBatch);

      let workflowInstanceId: string | undefined;
      if (useWorkflow && !dryRun) {
        const instance = await env.INVESTIGATION_WORKFLOW.create({
          id: `inv-${requestId}`,
          params: { requestId, question: body.question, logicalTaskCount: logicalCount },
        });
        workflowInstanceId = instance.id;
      }

      if (!dryRun) {
        for (const batch of batches) {
          for (let i = 0; i < batch.length; i += 100) {
            const sub = batch.slice(i, i + 100);
            await env.TASK_QUEUE.sendBatch(sub.map(msg => ({ body: msg })));
          }
        }
      }

      const requiredBatches = Math.ceil(logicalCount / TASKS_PER_BATCH);
      const estimatedOps = logicalCount * 3;
      const freeTierOpsPerDay = 10000;

      return Response.json({
        requestId,
        workflowInstanceId,
        message: dryRun 
          ? "Dry-run complete. No queue messages sent." 
          : useWorkflow 
            ? "Investigation started with Workflow for long-running monitoring. Tasks tracked in durable ledger. Batches queued."
            : "Investigation started. Tasks tracked in durable ledger. Batches queued.",
        simulator: {
          logicalTasks: logicalCount,
          tasksPerBatch: TASKS_PER_BATCH,
          requiredBatches,
          uniqueTasksCreated: created.length,
          estimatedQueueOps: estimatedOps,
          freeTierOpsRemainingEstimate: Math.max(0, freeTierOpsPerDay - estimatedOps),
          note: "Conceptual batching. Actual execution respects CPU, subrequest, storage, and queue limits. ~3 ops per message. Workflow steps counted separately (free tier: 3,000/day). Simulator outcomes are not evidence of real agent research.",
        },
        note: "No Cloudflare billing upgrade or deployment performed. Read-only by default. Humans retain publication/legal authority.",
      });
    }

    if (url.pathname.startsWith("/graph/") && request.method === "GET") {
      const requestId = url.pathname.split("/")[2];
      const stub = env.TASK_LEDGER.getByName(requestId);
      const graph = await stub.getEvidenceGraph(requestId);
      return Response.json({
        requestId,
        ...graph,
        architecture: "SEYMOUR SWARM v0.2 - JSON Evidence Graph: Deduplicate • Verify • Reconcile • Replay",
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
          agentTypes: AGENT_TYPES,
        },
        freeTier: {
          queueOpsPerDay: 10000,
          workflowStepsPerDay: 3000,
          concurrentWorkflowInstances: 100,
          note: "Messages typically consume 3 operations each (write/read/delete). Workflow steps are billed separately.",
        },
      });
    }

    return new Response("SEYMOUR SWARM ORCHESTRATOR v0.4\nPOST /control-desk {mission, scope?, roles?, dryRun?}\nPOST /bus/enqueue {from, to, payload}\nPOST /bus/direct {toBinding, payload}\nPOST /bus/state {key, value}\nPOST /recovery/save {missionId, status, lastStep, payload, timestamp, note}\nGET /recovery/load/{missionId}\nGET /recovery/unfinished\nPOST /investigate {question, logicalTaskCount?, dryRun?, useWorkflow?}\nGET /graph/{requestId}\nGET /workflow/{instanceId}\nGET /simulator/status", { status: 200 });
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const touched = new Set<string>();
    for (const msg of batch.messages) {
      const { taskId, requestId, type, query } = msg.body as any;
      const stub = env.TASK_LEDGER.getByName(requestId);

      // Simulator path: outcomes are UNKNOWN by design.
      // This is not evidence of real agent research or Grok communication.
      const outcome = "UNKNOWN";
      await stub.updateOutcome(taskId, outcome as any, { 
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
            payload: { requestId, source: "task-queue", kind: "tasks-settled" },
          });
        } catch {
          // No Workflow requested, already finished, or transient failure.
        }
      }
    }
  },
} satisfies ExportedHandler<Env>;

async function hashStr(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export { TaskLedger, InvestigationWorkflow, MissionState };
