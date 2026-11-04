import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import type { MissionCheckpoint } from "./recovery";

const VALID = new Set(["STARTED", "IN_PROGRESS", "DELIVERED", "HOLD", "FAILED"]);
const MAX_BYTES = 64 * 1024;

/** One registry instance owns a durable, queryable index of all missions. */
export class MissionState extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
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

  async save(checkpoint: MissionCheckpoint): Promise<{saved: true; missionId: string; revision: number; updatedAt: number}> {
    if (!checkpoint || typeof checkpoint.missionId !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(checkpoint.missionId) ||
        !VALID.has(checkpoint.status) ||
        typeof checkpoint.lastStep !== "string" || checkpoint.lastStep.length > 512 ||
        typeof checkpoint.note !== "string" || checkpoint.note.length > 4096) {
      throw new Error("INVALID_CHECKPOINT");
    }
    let payload: string;
    try { payload = JSON.stringify(checkpoint.payload ?? null); }
    catch { throw new Error("INVALID_PAYLOAD"); }
    if (new TextEncoder().encode(payload).byteLength > MAX_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    const now = Date.now();
    this.ctx.storage.sql.exec(`
      INSERT INTO checkpoints(mission_id,status,last_step,payload,timestamp,note,revision,updated_at)
      VALUES(?,?,?,?,?,?,1,?)
      ON CONFLICT(mission_id) DO UPDATE SET
        status=excluded.status,last_step=excluded.last_step,payload=excluded.payload,
        timestamp=excluded.timestamp,note=excluded.note,
        revision=checkpoints.revision+1,updated_at=excluded.updated_at
    `, checkpoint.missionId, checkpoint.status, checkpoint.lastStep, payload,
        now, checkpoint.note, now);
    const result = this.ctx.storage.sql.exec(
      "SELECT revision FROM checkpoints WHERE mission_id = ?", checkpoint.missionId
    ).one() as {revision: number};
    return {saved: true, missionId: checkpoint.missionId, revision: result.revision, updatedAt: now};
  }

  async load(missionId: string): Promise<(MissionCheckpoint & {revision:number}) | null> {
    const rows = this.ctx.storage.sql.exec(
      "SELECT * FROM checkpoints WHERE mission_id = ?", missionId
    ).toArray();
    const r = rows[0];
    if (!r) return null;
    return {
      missionId: String(r.mission_id),
      status: r.status as MissionCheckpoint["status"],
      lastStep: String(r.last_step),
      payload: JSON.parse(String(r.payload)),
      timestamp: Number(r.timestamp),
      note: String(r.note),
      revision: Number(r.revision)
    };
  }

  async unfinished(limit = 100): Promise<Array<{missionId:string;status:string;lastStep:string;timestamp:number;revision:number}>> {
    const n = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 100;
    return this.ctx.storage.sql.exec(
      "SELECT mission_id,status,last_step,updated_at,revision FROM checkpoints WHERE status IN ('STARTED','IN_PROGRESS','HOLD','FAILED') ORDER BY updated_at DESC LIMIT ?", n
    ).toArray().map(r => ({
      missionId: String(r.mission_id), status: String(r.status), lastStep: String(r.last_step),
      timestamp: Number(r.updated_at), revision: Number(r.revision)
    }));
  }
}
