import type { MissionState } from "./mission-state";

// Seymour v0.4 Agent Message Bus skeleton
// Service Bindings for direct calls, Queues for async jobs, Durable Objects for shared state.
// No credentials, no deployment performed.

export interface BusMessage {
  id: string;
  from: string;
  to: string;
  type: "direct" | "async" | "state";
  payload: unknown;
  timestamp: number;
}

export interface BusEnv {
  // Service Bindings (direct calls to other Workers) — declare in wrangler when ready
  // EXAMPLE_AGENT?: Fetcher;

  // Queues for asynchronous jobs
  BUS_QUEUE?: Queue;

  // Durable Object for shared task / mission state
  MISSION_STATE?: DurableObjectNamespace<MissionState>;
}

export async function sendDirect(env: BusEnv, toBinding: string, payload: unknown): Promise<Response> {
  // Placeholder: Service Binding call
  // const binding = (env as any)[toBinding] as Fetcher | undefined;
  // if (!binding) return new Response("Binding not configured", { status: 501 });
  // return binding.fetch(new Request("https://internal", { method: "POST", body: JSON.stringify(payload) }));
  return Response.json({
    status: "HOLD",
    note: "Service Binding not yet configured. Declare in wrangler.jsonc when agents are available.",
    to: toBinding,
    payload,
  }, { status: 501 });
}

export async function enqueueAsync(env: BusEnv, msg: Omit<BusMessage, "id" | "timestamp">): Promise<{ id: string } | { error: string }> {
  if (!env.BUS_QUEUE) {
    return { error: "BUS_QUEUE not bound" };
  }
  const full: BusMessage = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  await env.BUS_QUEUE.send(full);
  return { id: full.id };
}

export async function updateSharedState(env: BusEnv, key: string, value: unknown): Promise<Response> {
  if (!env.MISSION_STATE) {
    return new Response("MISSION_STATE Durable Object not bound", { status: 501 });
  }
  // Placeholder: get stub and store
  // const stub = env.MISSION_STATE.getByName(key);
  // await stub.fetch(new Request("https://internal/set", { method: "POST", body: JSON.stringify(value) }));
  return Response.json({
    status: "HOLD",
    note: "Durable Object state update stubbed. Implement MissionState class when ready.",
    key,
    value,
  }, { status: 501 });
}
