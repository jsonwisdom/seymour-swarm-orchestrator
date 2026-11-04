import { TaskLedger, Task } from "./task-ledger";

export interface Env {
  TASK_LEDGER: DurableObjectNamespace<TaskLedger>;
  TASK_QUEUE: Queue;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/investigate" && request.method === "POST") {
      const body = await request.json() as { question: string; requestId?: string };
      const requestId = body.requestId || crypto.randomUUID();
      const stub = env.TASK_LEDGER.getByName(requestId); // one ledger per investigation for simplicity; or use a global one

      // Illustrative fan-out: break into logical tasks (in real, AI would decompose)
      const logicalTasks: Partial<Task>[] = [
        { type: "source", query: `primary sources for: ${body.question}`, provenance: "user-request", dependencies: [], costBudget: 1, hash: await hashStr(body.question + "source") },
        { type: "legal", query: `legal research on: ${body.question}`, provenance: "user-request", dependencies: [], costBudget: 2, hash: await hashStr(body.question + "legal") },
        { type: "audit", query: `audit claims in: ${body.question}`, provenance: "user-request", dependencies: [], costBudget: 1, hash: await hashStr(body.question + "audit") },
        // ... more agents as needed
      ];

      const created: Task[] = [];
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

        // Enqueue bounded batch (example: one message per task or batch later)
        await env.TASK_QUEUE.send({
          taskId: task.id,
          requestId,
          type: task.type,
          query: task.query,
        });
      }

      return Response.json({
        requestId,
        message: "Investigation started. Tasks tracked in durable ledger. Batches queued (respect free tier: ~3k tasks/day effective via ops).",
        tasksCreated: created.length,
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

    return new Response("SEYMOUR SWARM ORCHESTRATOR v0.2\nPOST /investigate {question}\nGET /graph/{requestId}", { status: 200 });
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { taskId, requestId, type, query } = msg.body as any;
      const stub = env.TASK_LEDGER.getByName(requestId);

      // Simulate agent execution (in real: call source agents, etc.)
      // For free tier / starter: mark as UNKNOWN or mock PASS
      const outcome = Math.random() > 0.2 ? "PASS" : "UNKNOWN";
      await stub.updateOutcome(taskId, outcome as any, { simulated: true, note: "Replace with real agent logic. Bounded batch execution." });

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
