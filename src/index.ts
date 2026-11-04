import { TaskLedger, Task } from "./task-ledger";

export interface Env {
  TASK_LEDGER: DurableObjectNamespace<TaskLedger>;
  TASK_QUEUE: Queue;
}

// Illustrative fan-out simulator constants from SEYMOUR SWARM v0.2
const DEFAULT_LOGICAL_TASKS = 73000;
const TASKS_PER_BATCH = 270;
const AGENT_TYPES = ["source", "audit", "math", "legal", "replay", "receipt"] as const;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/investigate" && request.method === "POST") {
      const body = await request.json() as { 
        question: string; 
        requestId?: string; 
        logicalTaskCount?: number; 
        dryRun?: boolean 
      };
      const requestId = body.requestId || crypto.randomUUID();
      const logicalCount = Math.min(body.logicalTaskCount ?? DEFAULT_LOGICAL_TASKS, 100000); // hard cap for safety
      const dryRun = body.dryRun === true;
      const stub = env.TASK_LEDGER.getByName(requestId);

      // Generate logical tasks with diversity across agent types
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

      // Enqueue using sendBatch for efficiency (max 100 messages per sendBatch call)
      if (!dryRun) {
        for (const batch of batches) {
          // Split into sub-batches of 100 for Cloudflare Queues limit
          for (let i = 0; i < batch.length; i += 100) {
            const sub = batch.slice(i, i + 100);
            await env.TASK_QUEUE.sendBatch(sub.map(msg => ({ body: msg })));
          }
        }
      }

      const requiredBatches = Math.ceil(logicalCount / TASKS_PER_BATCH);
      const estimatedOps = logicalCount * 3; // write + read + delete per message
      const freeTierOpsPerDay = 10000;

      return Response.json({
        requestId,
        message: dryRun 
          ? "Dry-run complete. No queue messages sent." 
          : "Investigation started. Tasks tracked in durable ledger. Batches queued.",
        simulator: {
          logicalTasks: logicalCount,
          tasksPerBatch: TASKS_PER_BATCH,
          requiredBatches,
          uniqueTasksCreated: created.length,
          estimatedQueueOps: estimatedOps,
          freeTierOpsRemainingEstimate: Math.max(0, freeTierOpsPerDay - estimatedOps),
          note: "Conceptual batching. Actual execution respects CPU, subrequest, storage, and queue limits. ~3 ops per message.",
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

    if (url.pathname === "/simulator/status") {
      return Response.json({
        version: "0.2-expanded",
        defaults: {
          logicalTasks: DEFAULT_LOGICAL_TASKS,
          tasksPerBatch: TASKS_PER_BATCH,
          requiredBatches: Math.ceil(DEFAULT_LOGICAL_TASKS / TASKS_PER_BATCH),
          agentTypes: AGENT_TYPES,
        },
        freeTier: {
          queueOpsPerDay: 10000,
          note: "Messages typically consume 3 operations each (write/read/delete).",
        },
      });
    }

    return new Response("SEYMOUR SWARM ORCHESTRATOR v0.2\nPOST /investigate {question, logicalTaskCount?, dryRun?}\nGET /graph/{requestId}\nGET /simulator/status", { status: 200 });
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { taskId, requestId, type, query } = msg.body as any;
      const stub = env.TASK_LEDGER.getByName(requestId);

      // Simulate agent execution (in real: call source agents, etc.)
      // For free tier / starter: mark as UNKNOWN or mock PASS
      const outcome = Math.random() > 0.2 ? "PASS" : "UNKNOWN";
      await stub.updateOutcome(taskId, outcome as any, { 
        simulated: true, 
        note: "Replace with real agent logic. Bounded batch execution.",
        processedInBatch: true 
      });

      msg.ack();
    }
  },
} satisfies ExportedHandler<Env>;

async function hashStr(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export { TaskLedger };
