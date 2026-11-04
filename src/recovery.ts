// Seymour v0.4 Recovery skeleton
// Save completed work and resume unfinished missions.
// No credentials, no deployment performed.

export interface MissionCheckpoint {
  missionId: string;
  status: "STARTED" | "IN_PROGRESS" | "DELIVERED" | "HOLD" | "FAILED";
  lastStep: string;
  payload: unknown;
  timestamp: number;
  note: string;
}

export interface RecoveryEnv {
  MISSION_STATE?: DurableObjectNamespace;
}

export async function saveCheckpoint(env: RecoveryEnv, checkpoint: MissionCheckpoint): Promise<{ saved: boolean; note: string }> {
  if (!env.MISSION_STATE) {
    return {
      saved: false,
      note: "MISSION_STATE Durable Object not bound. Checkpoint not persisted."
    };
  }
  // Placeholder: store in Durable Object
  // const stub = env.MISSION_STATE.getByName(checkpoint.missionId);
  // await stub.fetch(new Request("https://internal/checkpoint", {
  //   method: "POST",
  //   body: JSON.stringify(checkpoint)
  // }));
  return {
    saved: false,
    note: "Durable Object write stubbed. Implement MissionState class to enable persistence."
  };
}

export async function loadCheckpoint(env: RecoveryEnv, missionId: string): Promise<MissionCheckpoint | null> {
  if (!env.MISSION_STATE) {
    return null;
  }
  // Placeholder: load from Durable Object
  // const stub = env.MISSION_STATE.getByName(missionId);
  // const res = await stub.fetch(new Request("https://internal/checkpoint"));
  // if (!res.ok) return null;
  // return res.json();
  return null;
}

export async function listUnfinished(env: RecoveryEnv): Promise<string[]> {
  // Placeholder: query Durable Object or index
  return [];
}
