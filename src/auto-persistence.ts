import type { Env } from "./index";
import type { MissionCheckpoint } from "./recovery";

type StoredProbe = MissionCheckpoint & { revision: number };
import { saveCheckpoint, loadCheckpoint } from "./recovery";

export const AUTO_PROBE_ID = "seymour-scheduled-storage-proof-v1";
const MARKER = "seymour-cron-storage-proof";
const HISTORY = "seymour-previous-probe-v1";

type PreviousProbe = { runId: string; marker: string; revision: number; timestamp: number };

export interface AutoProbeResult {
  schema: "SEYMOUR_AUTOMATED_PERSISTENCE_V1";
  result: "PASS" | "FAIL";
  at: string;
  priorRunVerified: boolean;
  currentRoundtripVerified: boolean;
  revision: number | null;
  error?: string;
}

/**
 * Scheduled internal storage audit; never calls public or Access routes.
 * Reads prior durable run first, then performs two write/read cycles to
 * verify durable storage. The fixed mission ID avoids unbounded row growth.
 * A clean first run is FAIL-closed as prior run is not yet proven.
 */
export async function runAutomatedPersistenceProbe(env: Env, now = Date.now()): Promise<AutoProbeResult> {
  const at = new Date(now).toISOString();
  if (!env.MISSION_STATE) return {
    schema:"SEYMOUR_AUTOMATED_PERSISTENCE_V1",result:"FAIL",at,
    priorRunVerified:false,currentRoundtripVerified:false,revision:null,error:"MISSION_STATE_NOT_BOUND"
  };
  const prior = await loadCheckpoint(env, HISTORY) as StoredProbe | null;
  let priorRunVerified = false;
  let currentRoundtripVerified = false;
  let revision: number | null = null;
  try {
    if (prior?.status === "DELIVERED" && typeof prior.payload === "object" &&
        prior.payload !== null) {
      const p = prior.payload as PreviousProbe;
      const past = await loadCheckpoint(env, AUTO_PROBE_ID) as StoredProbe | null;
      priorRunVerified = p.marker === MARKER && p.revision === past?.revision &&
        past?.payload !== null && typeof past?.payload === "object" &&
        (past.payload as PreviousProbe).runId === p.runId && p.runId.length >= 10;
    }
    const runId = crypto.randomUUID();
    const seed = {runId, marker:MARKER, revision:0, timestamp:now};
    const start = await saveCheckpoint(env,{
      missionId:AUTO_PROBE_ID,status:"STARTED",lastStep:"cron-started",
      payload:seed,timestamp:now,note:"Synthetic scheduled probe; no user content"
    });
    if (!start.saved || !("revision" in start)) throw Error("STARTED_SAVE_FAILED");
    const startRead = await loadCheckpoint(env,AUTO_PROBE_ID) as StoredProbe | null;
    if (startRead?.status !== "STARTED" || startRead.revision !== start.revision ||
        (startRead.payload as PreviousProbe)?.runId !== runId) throw Error("STARTED_READ_MISMATCH");
    const progress = await saveCheckpoint(env,{
      missionId:AUTO_PROBE_ID,status:"DELIVERED",lastStep:"cron-delivered",
      payload:{...seed,revision:start.revision+1},timestamp:now,
      note:"Synthetic scheduled probe; verify next cron reads this value"
    });
    if (!progress.saved || !("revision" in progress) || progress.revision !== start.revision+1) throw Error("REVISION_MISMATCH");
    const finalRead = await loadCheckpoint(env,AUTO_PROBE_ID) as StoredProbe | null;
    if (finalRead?.status !== "DELIVERED" || finalRead.revision !== progress.revision ||
        (finalRead.payload as PreviousProbe)?.runId !== runId) throw Error("FINAL_READ_MISMATCH");
    currentRoundtripVerified = true;
    revision = progress.revision;
    const result = priorRunVerified ? "PASS" : "FAIL";
    await saveCheckpoint(env,{
      missionId:HISTORY,status:"DELIVERED",lastStep:"cron-result",
      payload:{runId,marker:MARKER,revision:progress.revision,timestamp:now},
      timestamp:now,note:result === "PASS" ?
        "PASS: prior scheduled run survived and current read/write checked" :
        "HOLD: current read/write checked, previous-run proof pending or failed"
    });
    return {schema:"SEYMOUR_AUTOMATED_PERSISTENCE_V1",result,at,
      priorRunVerified,currentRoundtripVerified,revision,
      ...(result === "FAIL" ? {error:"PREVIOUS_RUN_NOT_VERIFIED"} : {})};
  } catch (e) {
    const error = e instanceof Error ? e.message : "UNEXPECTED_ERROR";
    return {schema:"SEYMOUR_AUTOMATED_PERSISTENCE_V1",result:"FAIL",at,
      priorRunVerified,currentRoundtripVerified,revision,error};
  }
}
