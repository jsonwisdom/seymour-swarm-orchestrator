import type { MissionState } from "./mission-state";

export interface MissionCheckpoint {
  missionId: string;
  status: "STARTED" | "IN_PROGRESS" | "DELIVERED" | "HOLD" | "FAILED";
  lastStep: string;
  payload: unknown;
  timestamp: number;
  note: string;
}

export interface RecoveryEnv {
  MISSION_STATE?: DurableObjectNamespace<MissionState>;
}

const REGISTRY = "seymour-mission-registry-v1";
function registry(env: RecoveryEnv) {
  return env.MISSION_STATE?.getByName(REGISTRY);
}

export async function saveCheckpoint(env: RecoveryEnv, checkpoint: MissionCheckpoint) {
  const stub = registry(env);
  if (!stub) return {saved:false, note:"MISSION_STATE not bound"};
  return stub.save(checkpoint);
}

export async function loadCheckpoint(env: RecoveryEnv, missionId: string) {
  const stub = registry(env);
  if (!stub) return null;
  return stub.load(missionId);
}

export async function listUnfinished(env: RecoveryEnv) {
  const stub = registry(env);
  if (!stub) return [];
  return stub.unfinished();
}
