/**
 * Drive snapshot — refreshed 2026-11-04T10:32:00Z
 * Committed metadata and short excerpts. Not a live Drive API connection.
 * Includes original 13 Seymour documents plus recovery indexes and lineage pointers.
 * Live service-account path remains a separate upgrade.
 */
export interface DrivePointer {
  id: string;
  title: string;
  modified: string;
  href: string;
  status: string;
  excerpt: string;
}

export const DRIVE_SNAPSHOT_DATE = "2026-11-04T10:32:00Z";
export const DRIVE_SNAPSHOT_DELTA = "RECOVERY_INDEXES_ADDED";
export const DRIVE_SNAPSHOT_COUNT = 21;

export const DRIVE_POINTERS: DrivePointer[] = [
  {
    id: "1dTdg68kOHSKF5epPS7R9JEoMXzOn1cAYBwwX6etqmC4",
    title: "Seymour Supreme — Media, Women & Girls, Twelve Lanes of Justice — DESIGN_HOLD — 2026-10-20",
    modified: "2026-10-20T21:50:53Z",
    href: "https://docs.google.com/document/d/1dTdg68kOHSKF5epPS7R9JEoMXzOn1cAYBwwX6etqmC4",
    status: "DESIGN_HOLD",
    excerpt: "Bring media reporting back into Jason’s civic-learning and audit game. Include women and girls accurately. Fun supports participation; it does not change evidence status. Saved design, not a live incident service."
  },
  {
    id: "1gDG2jlGYH3DzM9Xx6HeKy8RmShLSznZOap7MTfUf2hc",
    title: "JASON_ON_BASE_FAMILY_GAME_WOLFRAM_SEYMOUR_REPLAY_V0_1 — Design HOLD",
    modified: "2026-10-12T02:09:17Z",
    href: "https://docs.google.com/document/d/1gDG2jlGYH3DzM9Xx6HeKy8RmShLSznZOap7MTfUf2hc",
    status: "DESIGN_HOLD",
    excerpt: "FAMILY_GATE → DOCUMENT_SOURCE → PUBLIC_SAFE_SYNTAX → GAME → WALLET_PERMISSION → WOLFRAM_MATH → SEYMOUR_EVIDENCE_REPLAY. State: PARTIAL_CODE_COMMITTED_IN_DRAFT_PR / NOT_DEPLOYED."
  },
  {
    id: "1SW0HMFtvsufxdR-c0xwqhiKizzTz8IXLmR9WUaIeoiA",
    title: "SeymourSupreme — Jason Role Promotion and Warrant Gate V0.1",
    modified: "2026-10-08T21:13:15Z",
    href: "https://docs.google.com/document/d/1SW0HMFtvsufxdR-c0xwqhiKizzTz8IXLmR9WUaIeoiA",
    status: "DESIGN",
    excerpt: "Role promotion and warrant gate design."
  },
  {
    id: "1kguOhl8i2x62am-r-BMTeJDFzWMZvhghA8kxnAXkSuA",
    title: "SUPREME_SEYMOUR_QUATERNION_LOCKWOOD_DOD_V0_1 — Forensic Narrative Replay",
    modified: "2026-10-08T21:00:12Z",
    href: "https://docs.google.com/document/d/1kguOhl8i2x62am-r-BMTeJDFzWMZvhghA8kxnAXkSuA",
    status: "DESIGN",
    excerpt: "Forensic narrative replay design."
  },
  {
    id: "1yLg5CSixHo1e1lrKEeJP8RVts99vMY44fK0xqPICxNI",
    title: "SupremeSeymourSCOTUS — SS-702-20261008 — Public Audit Checkpoint",
    modified: "2026-10-08T20:30:57Z",
    href: "https://docs.google.com/document/d/1yLg5CSixHo1e1lrKEeJP8RVts99vMY44fK0xqPICxNI",
    status: "AUDIT_CHECKPOINT",
    excerpt: "Public audit checkpoint."
  },
  {
    id: "1lMCCcwrsJJGVph2KkUZTGnK1tt_6PfhndVRw7vMaxEM",
    title: "BINDING EDGE PROTOCOL V0.1 — SUPREME SEYMOUR",
    modified: "2026-10-04T22:02:23Z",
    href: "https://docs.google.com/document/d/1lMCCcwrsJJGVph2KkUZTGnK1tt_6PfhndVRw7vMaxEM",
    status: "PROTOCOL",
    excerpt: "Binding edge protocol specification."
  },
  {
    id: "1qfHyf3Xhqilg1bZuIuEHPDKjnOsixIFfrtpuNmgHI38",
    title: "RECEIPT CLAIM-CLASS SPECIFICATION V0.1 — SUPREME SEYMOUR",
    modified: "2026-10-04T21:59:22Z",
    href: "https://docs.google.com/document/d/1qfHyf3Xhqilg1bZuIuEHPDKjnOsixIFfrtpuNmgHI38",
    status: "SPEC",
    excerpt: "Receipt claim-class specification."
  },
  {
    id: "100U0n7jJG0RYynStfnk3_RPphBGk5N81R-2MenldBTI",
    title: "SUPREME_SEYMOUR_CONSTITUTIONAL_RUNTIME_V1",
    modified: "2026-09-24T19:12:47Z",
    href: "https://docs.google.com/document/d/100U0n7jJG0RYynStfnk3_RPphBGk5N81R-2MenldBTI",
    status: "PROPOSED",
    excerpt: "STATUS: PROPOSED / OPERATIONAL RUNTIME. CANON: FALSE. MACHINE_AUTHORITY_CREATED: FALSE. FINAL_DECISION_ENDPOINT: HUMAN. Reconstructs claimed government process against constitutional and statutory requirements. Does not replace courts."
  },
  {
    id: "11fRRdVB-vEAa1XZfbz6-tBHjawcvHGk786mxQ4Tr0UY",
    title: "SEYMOUR_COLLISION_MEMBRANE_2026-09-23_V1",
    modified: "2026-09-23T23:33:19Z",
    href: "https://docs.google.com/document/d/11fRRdVB-vEAa1XZfbz6-tBHjawcvHGk786mxQ4Tr0UY",
    status: "DESIGN",
    excerpt: "Collision membrane design."
  },
  {
    id: "1WprcjLmYV24sPjZOeGEhGT0pnNRuQlQhjR3Lt4FhAic",
    title: "Supreme Seymour Prime — Media Access Case Replay — 2026-09-23",
    modified: "2026-09-23T19:39:24Z",
    href: "https://docs.google.com/document/d/1WprcjLmYV24sPjZOeGEhGT0pnNRuQlQhjR3Lt4FhAic",
    status: "REPLAY",
    excerpt: "Media access case replay."
  },
  {
    id: "1EsBpGAFCgIks6vamfnQ4ObJgviKd0y9_eXPhr2suWnY",
    title: "Supreme Seymour Prime — CourtListener Daily Replay — 2026-09-23",
    modified: "2026-09-23T19:37:11Z",
    href: "https://docs.google.com/document/d/1EsBpGAFCgIks6vamfnQ4ObJgviKd0y9_eXPhr2suWnY",
    status: "REPLAY",
    excerpt: "CourtListener daily replay."
  },
  {
    id: "1bwaYRJrCC1oja65z3cSs8f2CEizOV-HCN-7L8Txqa9E",
    title: "Supreme Seymour Recursive Learning Flywheel V0.1 — Operator Manual",
    modified: "2026-09-23T19:33:47Z",
    href: "https://docs.google.com/document/d/1bwaYRJrCC1oja65z3cSs8f2CEizOV-HCN-7L8Txqa9E",
    status: "MANUAL",
    excerpt: "Recursive learning flywheel operator manual."
  },
  {
    id: "1Ea6jfC0WiWJiFQhUKLHh1gbqbVBvHLn1wbDWnwOedz4",
    title: "SUPREME_SEYMOUR_CONSTITUTIONAL_SYSTEM_2026-09-23",
    modified: "2026-09-23T16:51:02Z",
    href: "https://docs.google.com/document/d/1Ea6jfC0WiWJiFQhUKLHh1gbqbVBvHLn1wbDWnwOedz4",
    status: "SYSTEM",
    excerpt: "Constitutional system design."
  },
  {
    id: "1O22teQasYg8R5Q5IiE0czu8YzK5vb-Ja",
    title: "JASON_HISTORICAL_COVERAGE_2014_2026_READONLY_V01.md",
    modified: "2026-10-29T04:56:19Z",
    href: "https://drive.google.com/file/d/1O22teQasYg8R5Q5IiE0czu8YzK5vb-Ja",
    status: "RECOVERY_INDEX",
    excerpt: "Historical coverage index 2014–2026. Denominator remains unproven."
  },
  {
    id: "1PxW9jD7MqKpYtkTzoW83R21Kn2K_kD_M",
    title: "JASON_ESTATE_DISCOVERY_OODA_2026-10-28.md",
    modified: "2026-10-29T04:49:40Z",
    href: "https://drive.google.com/file/d/1PxW9jD7MqKpYtkTzoW83R21Kn2K_kD_M",
    status: "RECOVERY_INDEX",
    excerpt: "Estate discovery OODA record."
  },
  {
    id: "1RtjRyLMFLVzmO3vakzB4FBrnt3o4X23w",
    title: "JASON_EVIDENCE_FIRST_DRIVE_INDEX_2026-10-28.md",
    modified: "2026-10-29T04:47:58Z",
    href: "https://drive.google.com/file/d/1RtjRyLMFLVzmO3vakzB4FBrnt3o4X23w",
    status: "RECOVERY_INDEX",
    excerpt: "Evidence-first Drive index."
  },
  {
    id: "1b1CgalxdIGlZ27gyIybNQ3a29XvUL06t",
    title: "JASON_EVIDENCE_FIRST_DRIVE_BYTE_MANIFEST_2026-10-28.json",
    modified: "2026-10-29T04:48:04Z",
    href: "https://drive.google.com/file/d/1b1CgalxdIGlZ27gyIybNQ3a29XvUL06t",
    status: "RECOVERY_INDEX",
    excerpt: "Byte manifest for evidence-first Drive archive."
  },
  {
    id: "11oJkal3zTf7jWeN1jZm6BYDqed0B1SyITK_U0AFLHbo",
    title: "Jason's Daily — ChatGPT Map — JSONWisdom Replay",
    modified: "2026-10-14T22:09:29Z",
    href: "https://docs.google.com/document/d/11oJkal3zTf7jWeN1jZm6BYDqed0B1SyITK_U0AFLHbo",
    status: "RECOVERY_INDEX",
    excerpt: "Daily ChatGPT map and JSONWisdom replay."
  },
  {
    id: "1fKeOEGs5FQpU9DCxJ6p5meXaG5Xj1gwj",
    title: "JASONS_DAILY_RECOVERY_2026-09-09_TO_2026-09-26_V0_1.md",
    modified: "2026-09-27T02:43:39Z",
    href: "https://drive.google.com/file/d/1fKeOEGs5FQpU9DCxJ6p5meXaG5Xj1gwj",
    status: "RECOVERY_INDEX",
    excerpt: "Daily recovery log for 2026-09-09 to 2026-09-26."
  },
  {
    id: "1gWZ67ul67i9Gcj6V_ZDyN0_0cU4KRQfLCEWHVjbDG1U",
    title: "MASTER_ROOM_BUILD_2026-09-23_V1",
    modified: "2026-10-15T00:47:33Z",
    href: "https://docs.google.com/document/d/1gWZ67ul67i9Gcj6V_ZDyN0_0cU4KRQfLCEWHVjbDG1U",
    status: "LINEAGE",
    excerpt: "Master Room build record."
  },
  {
    id: "1aTmUgkwKuR8NsXCxH-6417QsUnVSyA7dA_6T830MXRo",
    title: "MASTER_ROOM_CHATGPT_CONVERSATION_LINEAGE_V1",
    modified: "2026-09-23T18:25:45Z",
    href: "https://docs.google.com/document/d/1aTmUgkwKuR8NsXCxH-6417QsUnVSyA7dA_6T830MXRo",
    status: "LINEAGE",
    excerpt: "ChatGPT conversation lineage for Master Room."
  }
];
