import type { RecoveryEnv } from "./recovery";
import { listUnfinished } from "./recovery";

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
    note: string;
  };
  summary: {
    total: number;
    actionable: number;
    staleExternal: number;
  };
}

/** Static external pointers discovered in Google Drive. Not synchronized. */
const DRIVE_POINTERS: Array<{id:string;title:string;modified:string;href:string}> = [
  {id:"1dTdg68kOHSKF5epPS7R9JEoMXzOn1cAYBwwX6etqmC4", title:"Seymour Supreme — Media, Women & Girls, Twelve Lanes of Justice — DESIGN_HOLD — 2026-10-20", modified:"2026-10-20T21:50:53Z", href:"https://docs.google.com/document/d/1dTdg68kOHSKF5epPS7R9JEoMXzOn1cAYBwwX6etqmC4"},
  {id:"1gDG2jlGYH3DzM9Xx6HeKy8RmShLSznZOap7MTfUf2hc", title:"JASON_ON_BASE_FAMILY_GAME_WOLFRAM_SEYMOUR_REPLAY_V0_1 — Design HOLD", modified:"2026-10-12T02:09:17Z", href:"https://docs.google.com/document/d/1gDG2jlGYH3DzM9Xx6HeKy8RmShLSznZOap7MTfUf2hc"},
  {id:"1SW0HMFtvsufxdR-c0xwqhiKizzTz8IXLmR9WUaIeoiA", title:"SeymourSupreme — Jason Role Promotion and Warrant Gate V0.1", modified:"2026-10-08T21:13:15Z", href:"https://docs.google.com/document/d/1SW0HMFtvsufxdR-c0xwqhiKizzTz8IXLmR9WUaIeoiA"},
  {id:"100U0n7jJG0RYynStfnk3_RPphBGk5N81R-2MenldBTI", title:"SUPREME_SEYMOUR_CONSTITUTIONAL_RUNTIME_V1", modified:"2026-09-24T19:12:47Z", href:"https://docs.google.com/document/d/100U0n7jJG0RYynStfnk3_RPphBGk5N81R-2MenldBTI"},
  {id:"1Ea6jfC0WiWJiFQhUKLHh1gbqbVBvHLn1wbDWnwOedz4", title:"SUPREME_SEYMOUR_CONSTITUTIONAL_SYSTEM_2026-09-23", modified:"2026-09-23T16:51:02Z", href:"https://docs.google.com/document/d/1Ea6jfC0WiWJiFQhUKLHh1gbqbVBvHLn1wbDWnwOedz4"}
];

export async function buildProjectIndex(env: RecoveryEnv): Promise<ProjectRecoveryIndex> {
  const now = new Date().toISOString();
  const unfinished = await listUnfinished(env);

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

  const externalEntries: ProjectIndexEntry[] = DRIVE_POINTERS.map(p => ({
    id: p.id,
    source: "EXTERNAL_POINTER",
    status: "EXTERNAL",
    lastStep: "drive-document",
    updatedAt: Date.parse(p.modified),
    revision: null,
    title: p.title,
    note: "Google Drive pointer — not synchronized into Worker",
    href: p.href
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
      note: "External Drive documents are referenced only. They are not loaded into the Worker and do not prove runtime state."
    },
    summary: {
      total: workerEntries.length + externalEntries.length,
      actionable,
      staleExternal: externalEntries.length
    }
  };
}
