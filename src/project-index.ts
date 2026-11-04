import type { RecoveryEnv } from "./recovery";
import { listUnfinished } from "./recovery";
import { fetchLiveDrivePointers, type DriveLiveEnv } from "./drive-live";

export interface ProjectIndexEntry {
  id: string;
  source: "MISSION_STATE" | "EXTERNAL_POINTER";
  status: string;
  lastStep: string;
  updatedAt: number;
  revision: number | null;
  title: string;
  note: string;
  href?: string;
  excerpt?: string;
}

export interface ProjectRecoveryIndex {
  schema: "SEYMOUR_PROJECT_INDEX_V1";
  generatedAt: string;
  worker: {
    unfinished: ProjectIndexEntry[];
    count: number;
    note: string;
  };
  external: {
    pointers: ProjectIndexEntry[];
    count: number;
    source: "LIVE" | "SNAPSHOT";
    snapshotDate: string;
    note: string;
    error?: string;
  };
  summary: {
    total: number;
    actionable: number;
    externalCount: number;
    driveLive: boolean;
  };
}

export async function buildProjectIndex(
  env: RecoveryEnv & DriveLiveEnv
): Promise<ProjectRecoveryIndex> {
  const now = new Date().toISOString();
  const unfinished = await listUnfinished(env);
  const drive = await fetchLiveDrivePointers(env);

  const workerEntries: ProjectIndexEntry[] = unfinished.map(m => ({
    id: m.missionId,
    source: "MISSION_STATE",
    status: m.status,
    lastStep: m.lastStep,
    updatedAt: m.timestamp,
    revision: m.revision,
    title: m.missionId,
    note: "Durable Object checkpoint"
  }));

  const externalEntries: ProjectIndexEntry[] = drive.pointers.map(p => ({
    id: p.id,
    source: "EXTERNAL_POINTER",
    status: p.status,
    lastStep: "drive-document",
    updatedAt: Date.parse(p.modified),
    revision: null,
    title: p.title,
    note: drive.source === "LIVE"
      ? "Live Google Drive listing"
      : "Google Drive snapshot — live connector unavailable",
    href: p.href,
    excerpt: p.excerpt
  }));

  const actionable = workerEntries.filter(e =>
    e.status === "STARTED" || e.status === "IN_PROGRESS" || e.status === "HOLD"
  ).length;

  return {
    schema: "SEYMOUR_PROJECT_INDEX_V1",
    generatedAt: now,
    worker: {
      unfinished: workerEntries,
      count: workerEntries.length,
      note: workerEntries.length === 0
        ? "No unfinished missions in Durable Object. Storage is empty or all work is DELIVERED."
        : "Unfinished missions from MISSION_STATE. These are the records Seymour can resume."
    },
    external: {
      pointers: externalEntries,
      count: externalEntries.length,
      source: drive.source,
      snapshotDate: drive.fetchedAt,
      note: drive.source === "LIVE"
        ? "Live Drive API response."
        : "Fell back to committed snapshot. Set GOOGLE_SERVICE_ACCOUNT secret and share files with the service account to enable live sync.",
      ...(drive.error ? { error: drive.error } : {})
    },
    summary: {
      total: workerEntries.length + externalEntries.length,
      actionable,
      externalCount: externalEntries.length,
      driveLive: drive.source === "LIVE"
    }
  };
}
