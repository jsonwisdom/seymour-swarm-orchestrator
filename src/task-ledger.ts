import { DurableObject } from "cloudflare:workers";

export interface Task {
  id: string;
  requestId: string;
  type: string; // source | audit | math | legal | replay | receipt
  query: string;
  provenance: string;
  dependencies: string[];
  costBudget: number;
  outcome: "PASS" | "FAIL" | "UNKNOWN" | "PENDING";
  result?: unknown;
  hash: string; // for dedup
  createdAt: number;
  updatedAt: number;
}

export class TaskLedger extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
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

  async createOrReuseTask(task: Omit<Task, "id" | "createdAt" | "updatedAt" | "outcome"> & { outcome?: string }): Promise<Task> {
    const existing = this.ctx.storage.sql.exec(
      "SELECT * FROM tasks WHERE hash = ?",
      task.hash
    ).toArray()[0];

    if (existing) {
      return this.rowToTask(existing);
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const full: Task = {
      ...task,
      id,
      outcome: (task.outcome as any) || "PENDING",
      createdAt: now,
      updatedAt: now,
    };

    this.ctx.storage.sql.exec(
      `INSERT INTO tasks (id, requestId, type, query, provenance, dependencies, costBudget, outcome, result, hash, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      full.id, full.requestId, full.type, full.query, full.provenance,
      JSON.stringify(full.dependencies), full.costBudget, full.outcome,
      full.result ? JSON.stringify(full.result) : null, full.hash, full.createdAt, full.updatedAt
    );

    return full;
  }

  async updateOutcome(id: string, outcome: Task["outcome"], result?: unknown): Promise<void> {
    this.ctx.storage.sql.exec(
      "UPDATE tasks SET outcome = ?, result = ?, updatedAt = ? WHERE id = ?",
      outcome, result ? JSON.stringify(result) : null, Date.now(), id
    );
  }

  async getProgressSummary(requestId: string): Promise<{total:number;pass:number;fail:number;unknown:number;pending:number}> {
    const rows = this.ctx.storage.sql.exec(
      "SELECT outcome, COUNT(*) AS count FROM tasks WHERE requestId = ? GROUP BY outcome", requestId
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

  async getTasksForRequest(requestId: string): Promise<Task[]> {
    const rows = this.ctx.storage.sql.exec(
      "SELECT * FROM tasks WHERE requestId = ?",
      requestId
    ).toArray();
    return rows.map(this.rowToTask);
  }

  async getEvidenceGraph(requestId: string): Promise<{ tasks: Task[]; stats: any }> {
    const tasks = await this.getTasksForRequest(requestId);
    const stats = {
      total: tasks.length,
      pass: tasks.filter(t => t.outcome === "PASS").length,
      fail: tasks.filter(t => t.outcome === "FAIL").length,
      unknown: tasks.filter(t => t.outcome === "UNKNOWN").length,
      pending: tasks.filter(t => t.outcome === "PENDING").length,
    };
    return { tasks, stats };
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      requestId: row.requestId,
      type: row.type,
      query: row.query,
      provenance: row.provenance,
      dependencies: JSON.parse(row.dependencies || "[]"),
      costBudget: row.costBudget,
      outcome: row.outcome,
      result: row.result ? JSON.parse(row.result) : undefined,
      hash: row.hash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
