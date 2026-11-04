var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/comms-directory.ts
var COMMS_DIRECTORY = {
  schema: "SEYMOUR_COMMS_DIRECTORY_V1",
  mode: "DESIGN_ONLY",
  connectedGrokAgents: 0,
  connectedServiceBindings: 0,
  historicalSeats: { total: 27, bound: 0, named: [
    { seat: "01", role: "Librarian" },
    { seat: "02", role: "Receipt Clerk" },
    { seat: "03", role: "Family Continuity" },
    { seat: "04", role: "Story Weaver" },
    { seat: "05", role: "Ops/Deploy" },
    { seat: "06", role: "Operator Mirror" }
  ], unnamed: 21 },
  federation: [
    { name: "Julie Powers", responsibility: "Federation coordination" },
    { name: "Sentinel", responsibility: "Permission and safety review" },
    { name: "Auditor", responsibility: "Receipts and accountability" },
    { name: "Historian", responsibility: "Timeline and evidence recovery" },
    { name: "Recon", responsibility: "Source exploration" },
    { name: "Engineer", responsibility: "Code and runtime verification" },
    { name: "Press", responsibility: "Drafting; publication gated" },
    { name: "Colonel Jessup", responsibility: "Handoff gate coordination" },
    { name: "Gambit Zero x402 Bot", responsibility: "Payment research; spending gated" },
    { name: "Grok Bot", responsibility: "Historical Grok role (distinct from legacy Grok Bot)" }
  ].map((agent) => ({ ...agent, connected: false, endpointVerified: false })),
  transports: {
    internal: "Cloudflare Service Bindings RPC \u2014 NOT CONFIGURED",
    asynchronous: "Cloudflare Queues \u2014 BUS_QUEUE NOT CONFIGURED",
    grok: "Authenticated adapter \u2014 NOT CONFIGURED"
  },
  next: "Verify bot endpoints, authenticate, test messages, record delivery receipts; do not interpret acknowledgments as completion."
};

// src/recovery.ts
var REGISTRY = "seymour-mission-registry-v1";
function registry(env) {
  return env.MISSION_STATE?.getByName(REGISTRY);
}
__name(registry, "registry");
async function saveCheckpoint(env, checkpoint) {
  const stub = registry(env);
  if (!stub) return { saved: false, note: "MISSION_STATE not bound" };
  return stub.save(checkpoint);
}
__name(saveCheckpoint, "saveCheckpoint");
async function loadCheckpoint(env, missionId) {
  const stub = registry(env);
  if (!stub) return null;
  return stub.load(missionId);
}
__name(loadCheckpoint, "loadCheckpoint");
async function listUnfinished(env) {
  const stub = registry(env);
  if (!stub) return [];
  return stub.unfinished();
}
__name(listUnfinished, "listUnfinished");

// src/auto-persistence.ts
var AUTO_PROBE_ID = "seymour-scheduled-storage-proof-v1";
var MARKER = "seymour-cron-storage-proof";
var HISTORY = "seymour-previous-probe-v1";
async function runAutomatedPersistenceProbe(env, now = Date.now(), source = "operator") {
  const at = new Date(now).toISOString();
  if (!env.MISSION_STATE) return {
    schema: "SEYMOUR_AUTOMATED_PERSISTENCE_V1",
    result: "FAIL",
    at,
    priorRunVerified: false,
    currentRoundtripVerified: false,
    revision: null,
    error: "MISSION_STATE_NOT_BOUND"
  };
  const prior = await loadCheckpoint(env, HISTORY);
  let priorRunVerified = false;
  let currentRoundtripVerified = false;
  let revision = null;
  try {
    if (prior?.status === "DELIVERED" && typeof prior.payload === "object" && prior.payload !== null) {
      const p = prior.payload;
      const past = await loadCheckpoint(env, AUTO_PROBE_ID);
      priorRunVerified = p.marker === MARKER && p.revision === past?.revision && past?.payload !== null && typeof past?.payload === "object" && past.payload.runId === p.runId && p.runId.length >= 10;
    }
    const runId = crypto.randomUUID();
    const seed = { runId, marker: MARKER, revision: 0, timestamp: now };
    const start = await saveCheckpoint(env, {
      missionId: AUTO_PROBE_ID,
      status: "STARTED",
      lastStep: "cron-started",
      payload: seed,
      timestamp: now,
      note: "Synthetic scheduled probe; no user content"
    });
    if (!start.saved || !("revision" in start)) throw Error("STARTED_SAVE_FAILED");
    const startRead = await loadCheckpoint(env, AUTO_PROBE_ID);
    if (startRead?.status !== "STARTED" || startRead.revision !== start.revision || startRead.payload?.runId !== runId) throw Error("STARTED_READ_MISMATCH");
    const progress = await saveCheckpoint(env, {
      missionId: AUTO_PROBE_ID,
      status: "DELIVERED",
      lastStep: "cron-delivered",
      payload: { ...seed, revision: start.revision + 1 },
      timestamp: now,
      note: "Synthetic scheduled probe; verify next cron reads this value"
    });
    if (!progress.saved || !("revision" in progress) || progress.revision !== start.revision + 1) throw Error("REVISION_MISMATCH");
    const finalRead = await loadCheckpoint(env, AUTO_PROBE_ID);
    if (finalRead?.status !== "DELIVERED" || finalRead.revision !== progress.revision || finalRead.payload?.runId !== runId) throw Error("FINAL_READ_MISMATCH");
    currentRoundtripVerified = true;
    revision = progress.revision;
    const result = priorRunVerified ? "PASS" : "FAIL";
    await saveCheckpoint(env, {
      missionId: HISTORY,
      status: "DELIVERED",
      lastStep: "cron-result",
      payload: { runId, marker: MARKER, revision: progress.revision, timestamp: now, source, result },
      timestamp: now,
      note: result === "PASS" ? "PASS: prior scheduled run survived and current read/write checked" : "HOLD: current read/write checked, previous-run proof pending or failed"
    });
    return {
      schema: "SEYMOUR_AUTOMATED_PERSISTENCE_V1",
      result,
      at,
      priorRunVerified,
      currentRoundtripVerified,
      revision,
      ...result === "FAIL" ? { error: "PREVIOUS_RUN_NOT_VERIFIED" } : {}
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "UNEXPECTED_ERROR";
    return {
      schema: "SEYMOUR_AUTOMATED_PERSISTENCE_V1",
      result: "FAIL",
      at,
      priorRunVerified,
      currentRoundtripVerified,
      revision,
      error
    };
  }
}
__name(runAutomatedPersistenceProbe, "runAutomatedPersistenceProbe");

// src/live-desk.ts
var HISTORY_ID = "seymour-previous-probe-v1";
var STALE_AFTER_MS = 26 * 60 * 60 * 1e3;
async function readLiveRecoveryStatus(env, now = Date.now()) {
  const [latest, history, unfinished] = await Promise.all([
    loadCheckpoint(env, AUTO_PROBE_ID),
    loadCheckpoint(env, HISTORY_ID),
    listUnfinished(env)
  ]);
  const latestRun = latest;
  const priorReceipt = history;
  const p = priorReceipt?.payload;
  const l = latestRun?.payload;
  const ageMs = typeof p?.timestamp === "number" && p.timestamp <= now ? now - p.timestamp : null;
  const validReceipt = !!(latestRun && priorReceipt && latestRun.status === "DELIVERED" && priorReceipt.status === "DELIVERED" && p?.runId && p.runId === l?.runId && p.revision === latestRun.revision && p.marker === "seymour-cron-storage-proof");
  const verdict = !validReceipt ? "UNKNOWN" : ageMs !== null && ageMs > STALE_AFTER_MS ? "STALE" : p?.result === "PASS" ? "PASS" : p?.result === "FAIL" ? "FAIL" : "BASELINE_ONLY";
  const otherUnfinished = unfinished.filter((x) => !x.missionId.startsWith("seymour-proof-") && x.missionId !== AUTO_PROBE_ID && x.missionId !== HISTORY_ID);
  return {
    schema: "SEYMOUR_LIVE_STATUS_V1",
    observedAt: new Date(now).toISOString(),
    service: "seymour-swarm-orchestrator",
    persistence: {
      verdict,
      receiptConsistent: validReceipt,
      lastRecordedAt: typeof p?.timestamp === "number" ? new Date(p.timestamp).toISOString() : null,
      ageMinutes: ageMs === null ? null : Math.floor(ageMs / 6e4),
      latestRevision: latestRun?.revision ?? null,
      runSource: p?.source ?? "UNKNOWN",
      scheduledCrossRunPass: validReceipt && p?.source === "scheduled" && p?.result === "PASS",
      note: validReceipt ? "Durable receipts agree. Displayed verdict is from the recorded run; runSource identifies whether it was a cron or operator test." : "No mutually consistent durable probe receipts observed."
    },
    scheduled: { cron: "17 10 * * *", timezone: "UTC", verification: "Configured; runtime delivery not inferred from schedule" },
    recovery: {
      unfinishedCount: otherUnfinished.length,
      sample: otherUnfinished.slice(0, 12).map((x) => ({
        missionId: x.missionId,
        status: x.status,
        revision: x.revision,
        lastStep: x.lastStep
      }))
    },
    boundaries: { externalSourceSync: "NOT_IMPLEMENTED", autonomousProjectRecovery: "NOT_VERIFIED" }
  };
}
__name(readLiveRecoveryStatus, "readLiveRecoveryStatus");
var LIVE_DESK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Seymour LIVE | Recovery Control Desk</title>
<link rel="stylesheet" href="/recovery/live.css"><script src="/recovery/live.js" defer><\/script></head>
<body><main>
<div class="top"><span class="eyebrow">SEYMOUR \xB7 LIVE CONTROL DESK</span><span class="secure">CLOUDFLARE ACCESS \xB7 OPERATOR</span></div>
<h1>Recovery, without starting over.</h1>
<p class="subtitle">Live durable-state evidence, not guesses. Private, read-only by default.</p>
<div class="metrics">
<section><span>Persistence</span><strong id="verdict">LOADING</strong><small id="age">No measurement yet</small></section>
<section><span>Unfinished work</span><strong id="unfinished">\u2014</strong><small>Excludes synthetic proof missions</small></section>
<section><span>Last revision</span><strong id="revision">\u2014</strong><small>Durable storage probe</small></section>
</div>
<div class="panels">
<section><h2>Automated storage watch</h2><p id="last">Waiting for the first verified receipt.</p><p>Schedule: daily 10:17 UTC. Dashboard refreshes every 30 seconds.</p>
<div class="actions"><button id="refresh">Refresh status</button><button id="probe">Run internal proof now</button></div>
<p class="hint">Run internal proof performs synthetic reads/writes. It never asks for PINs or creates external agent tasks.</p>
</section>
<section><h2>Resume work</h2><p>Most recent unfinished real mission records:</p><div id="missions" class="missions">Loading\u2026</div>
<p class="hint">Records are pointers, not proof that external projects were synchronized.</p></section>
</div>
<section class="wheel">
<h2>CWaaS \xB7 Wheel of Wisdom</h2>
<p>Evidence first. The project index includes Flywheel repository provenance, JASON audit stages, x402 settlement boundaries, and coverage math.</p>
<a class="wheel-link" href="/recovery/index">Open full project index \xB7 JSON evidence</a>
<p class="hint">Runtime Drive sync and payments are not implied by a repository or snapshot.</p>
</section>
<h2>Evidence receipt</h2><pre id="receipt" role="status" aria-live="polite">Loading verified state\u2026</pre>
<footer>PASS means a verified operation. UNKNOWN means there is not enough evidence. A schedule alone does not prove execution.</footer>
</main></body></html>`;
var LIVE_DESK_CSS = `
:root{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color-scheme:dark;color:#e6f3ff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 100% 0%,#16364c,#08101b 55%);min-height:100dvh}
main{max-width:1060px;padding:40px 22px;margin:auto}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.eyebrow{letter-spacing:.17em;font-size:12px;font-weight:800;color:#79e6d0}.secure{color:#99b6ca;font-size:11px;letter-spacing:.09em}
h1{font-size:clamp(34px,6vw,62px);letter-spacing:-.05em;margin:24px 0 8px;line-height:1.08}
.subtitle{color:#aebfd0;font-size:17px;margin:0 0 32px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.metrics section,.panels section{background:#101f30;border:1px solid #344a5e;border-radius:18px;padding:23px}
.metrics span,.metrics small{display:block;color:#9bb0c3}.metrics span{font-size:13px}.metrics strong{font-size:clamp(22px,3.2vw,34px);display:block;margin:10px 0;letter-spacing:-.04em}
.metrics small{font-size:12px}.panels{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:15px}
h2{font-size:18px;margin:2px 0 12px}p{color:#b2c4d5;line-height:1.5}.actions{display:flex;gap:10px;flex-wrap:wrap}
button{border:1px solid #6ee8d1;background:#71e4ca;color:#07242c;font:inherit;font-weight:750;border-radius:10px;padding:12px 16px;cursor:pointer}
button+button{background:transparent;color:#80eed6}button:disabled{opacity:.5;cursor:progress}.hint{font-size:12px;color:#879db0}
.missions{display:grid;gap:8px}.mission{border:1px solid #2e4559;border-radius:10px;padding:9px;overflow-wrap:anywhere;font-size:12px}
.mission b{display:block;font-size:13px}.mission span{color:#9aafc0}
pre{border:1px solid #31495d;background:#040c14;padding:20px;border-radius:15px;white-space:pre-wrap;overflow-wrap:anywhere;color:#b4eee0;font-size:12px}
.wheel{margin-top:16px;border:1px solid #4d837a;border-radius:18px;background:#0d2b31;padding:22px}.wheel-link{display:inline-block;color:#071f24;background:#71e4ca;text-decoration:none;font-weight:800;padding:12px 16px;border-radius:10px}.wheel-link:focus-visible{outline:3px solid #fff}footer{color:#8ea6ba;font-size:12px;margin:26px 0 0}
@media(max-width:680px){.metrics,.panels{grid-template-columns:1fr}.metrics{gap:9px}.metrics section{padding:16px}}
`;
var LIVE_DESK_JS = `
"use strict";
const byId = id => document.getElementById(id);
const render = data => {
  byId("verdict").textContent=data.persistence.verdict;
  byId("age").textContent=data.persistence.ageMinutes===null?"No production receipt":data.persistence.ageMinutes+" minutes since recorded receipt";
  byId("revision").textContent=data.persistence.latestRevision??"\u2014";
  byId("unfinished").textContent=data.recovery.unfinishedCount;
  byId("last").textContent=data.persistence.note + " Source: " + data.persistence.runSource;
  byId("missions").replaceChildren(...(data.recovery.sample.length ? data.recovery.sample.map(m=>{
    const box=document.createElement("div");box.className="mission";
    const name=document.createElement("b");name.textContent=m.missionId;
    const info=document.createElement("span");info.textContent=m.status+" \xB7 revision "+m.revision+" \xB7 "+m.lastStep;
    box.append(name,info);return box;
  }):[document.createTextNode("No unfinished mission pointers found.")]));
  byId("receipt").textContent=JSON.stringify(data,null,2);
};
async function request(path,method="GET") {
  const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",redirect:"error"});
  const json=await r.json();if(!r.ok && r.status!==202)throw Error("HTTP "+r.status+" "+(json.error||"request failed"));
  return json;
}
async function refresh(){try{render(await request("/recovery/live/status"))}catch(e){byId("receipt").textContent="UNKNOWN \u2014 status fetch failed: "+String(e)}}
byId("refresh").addEventListener("click",refresh);
byId("probe").addEventListener("click",async()=>{
  byId("probe").disabled=true;
  try{const result=await request("/recovery/probe-now","POST");
    byId("receipt").textContent=JSON.stringify({operation:"ON_DEMAND_PROBE",...result},null,2);
    await refresh();
  }catch(e){byId("receipt").textContent="FAIL \u2014 "+String(e)}
  finally{byId("probe").disabled=false}
});
refresh();setInterval(refresh,30000);
`;
var LIVE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};

// src/wheel-of-wisdom.ts
var WHEEL_OF_WISDOM = {
  schema: "CWaaS_WHEEL_OF_WISDOM_V1",
  mode: "READ_ONLY_EVIDENCE_REGISTRY",
  provenance: {
    source: "GITHUB_REPOSITORY",
    repo: "jsonwisdom/flywheel-of-wisdom",
    url: "https://github.com/jsonwisdom/flywheel-of-wisdom",
    statusUrl: "https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/STATUS.json",
    maintenanceUrl: "https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/docs/maintenance/CWAAS-DISPATCH-001-2026-11-01.md",
    observedAs: "REPOSITORY_REPORTED",
    checkedAt: "2026-11-04"
  },
  services: {
    cwaas: {
      label: "Computer Wisdom as a Service",
      status: "SOURCE_REFERENCED",
      integration: "NOT_CONNECTED_TO_WORKER",
      evidence: "https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/docs/maintenance/CWAAS-DISPATCH-001-2026-11-01.md"
    },
    flywheel: {
      label: "Flywheel of Wisdom",
      status: "REPOSITORY_VERIFIED",
      runtime: "NOT_INDEPENDENTLY_VERIFIED",
      evidence: "https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/README.md"
    },
    x402: {
      network: "eip155:8453",
      asset: "USDC",
      advertisedPriceUsd: 1,
      settlement: "NOT_VERIFIED",
      revenueUsd: "REPOSITORY_REPORTED_0",
      evidence: "https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/STATUS.json"
    },
    googleDrive: {
      status: "SNAPSHOT_OR_CONNECTOR_DEPENDENT",
      note: "ChatGPT-side Google Drive access does not grant the Cloudflare Worker a runtime token"
    },
    chatgpt: {
      status: "INTERACTIVE_CONNECTOR_ONLY",
      note: "No autonomous ChatGPT runtime is attached to Seymour"
    },
    wolfram: {
      status: "INTERACTIVE_RESEARCH_ONLY",
      note: "Calculations require actual input records; no recurring runtime attached"
    }
  },
  cycle: [
    { id: "J", name: "Jurisdiction", check: "Scope, authority, time and jurisdiction" },
    { id: "A", name: "Artifacts", check: "Original records, hashes and timestamps" },
    { id: "S", name: "Sources", check: "First-party, independent and reported evidence" },
    { id: "O", name: "Observations", check: "Measured results separate from assumptions" },
    { id: "N", name: "Next Test", check: "Falsifiable next action with owner and result" }
  ],
  guardrails: {
    authorityCreated: false,
    publication: "HOLD",
    walletActions: "DISABLED",
    credentialExposure: "FORBIDDEN",
    autoSpending: "DISABLED"
  }
};
function wheelCoverage(workerCount, externalCount) {
  const observed = workerCount + externalCount;
  return {
    indexedCount: observed,
    deduplicatedCount: null,
    historicalUniverseCount: null,
    historicalCoveragePercent: null,
    coverageVerdict: "UNKNOWN",
    reason: "No evidence-based denominator for all historical projects. Sources may overlap; indexed count is not unique verified project count."
  };
}
__name(wheelCoverage, "wheelCoverage");

// src/drive-snapshot.ts
var DRIVE_SNAPSHOT_DATE = "2026-11-04T09:07:00Z";
var DRIVE_POINTERS = [
  {
    id: "1dTdg68kOHSKF5epPS7R9JEoMXzOn1cAYBwwX6etqmC4",
    title: "Seymour Supreme \u2014 Media, Women & Girls, Twelve Lanes of Justice \u2014 DESIGN_HOLD \u2014 2026-10-20",
    modified: "2026-10-20T21:50:53Z",
    href: "https://docs.google.com/document/d/1dTdg68kOHSKF5epPS7R9JEoMXzOn1cAYBwwX6etqmC4",
    status: "DESIGN_HOLD",
    excerpt: "Bring media reporting back into Jason\u2019s civic-learning and audit game. Include women and girls accurately. Fun supports participation; it does not change evidence status. Saved design, not a live incident service."
  },
  {
    id: "1gDG2jlGYH3DzM9Xx6HeKy8RmShLSznZOap7MTfUf2hc",
    title: "JASON_ON_BASE_FAMILY_GAME_WOLFRAM_SEYMOUR_REPLAY_V0_1 \u2014 Design HOLD",
    modified: "2026-10-12T02:09:17Z",
    href: "https://docs.google.com/document/d/1gDG2jlGYH3DzM9Xx6HeKy8RmShLSznZOap7MTfUf2hc",
    status: "DESIGN_HOLD",
    excerpt: "FAMILY_GATE \u2192 DOCUMENT_SOURCE \u2192 PUBLIC_SAFE_SYNTAX \u2192 GAME \u2192 WALLET_PERMISSION \u2192 WOLFRAM_MATH \u2192 SEYMOUR_EVIDENCE_REPLAY. State: PARTIAL_CODE_COMMITTED_IN_DRAFT_PR / NOT_DEPLOYED."
  },
  {
    id: "1SW0HMFtvsufxdR-c0xwqhiKizzTz8IXLmR9WUaIeoiA",
    title: "SeymourSupreme \u2014 Jason Role Promotion and Warrant Gate V0.1",
    modified: "2026-10-08T21:13:15Z",
    href: "https://docs.google.com/document/d/1SW0HMFtvsufxdR-c0xwqhiKizzTz8IXLmR9WUaIeoiA",
    status: "DESIGN",
    excerpt: "Role promotion and warrant gate design."
  },
  {
    id: "1kguOhl8i2x62am-r-BMTeJDFzWMZvhghA8kxnAXkSuA",
    title: "SUPREME_SEYMOUR_QUATERNION_LOCKWOOD_DOD_V0_1 \u2014 Forensic Narrative Replay",
    modified: "2026-10-08T21:00:12Z",
    href: "https://docs.google.com/document/d/1kguOhl8i2x62am-r-BMTeJDFzWMZvhghA8kxnAXkSuA",
    status: "DESIGN",
    excerpt: "Forensic narrative replay design."
  },
  {
    id: "1yLg5CSixHo1e1lrKEeJP8RVts99vMY44fK0xqPICxNI",
    title: "SupremeSeymourSCOTUS \u2014 SS-702-20261008 \u2014 Public Audit Checkpoint",
    modified: "2026-10-08T20:30:57Z",
    href: "https://docs.google.com/document/d/1yLg5CSixHo1e1lrKEeJP8RVts99vMY44fK0xqPICxNI",
    status: "AUDIT_CHECKPOINT",
    excerpt: "Public audit checkpoint."
  },
  {
    id: "1lMCCcwrsJJGVph2KkUZTGnK1tt_6PfhndVRw7vMaxEM",
    title: "BINDING EDGE PROTOCOL V0.1 \u2014 SUPREME SEYMOUR",
    modified: "2026-10-04T22:02:23Z",
    href: "https://docs.google.com/document/d/1lMCCcwrsJJGVph2KkUZTGnK1tt_6PfhndVRw7vMaxEM",
    status: "PROTOCOL",
    excerpt: "Binding edge protocol specification."
  },
  {
    id: "1qfHyf3Xhqilg1bZuIuEHPDKjnOsixIFfrtpuNmgHI38",
    title: "RECEIPT CLAIM-CLASS SPECIFICATION V0.1 \u2014 SUPREME SEYMOUR",
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
    title: "Supreme Seymour Prime \u2014 Media Access Case Replay \u2014 2026-09-23",
    modified: "2026-09-23T19:39:24Z",
    href: "https://docs.google.com/document/d/1WprcjLmYV24sPjZOeGEhGT0pnNRuQlQhjR3Lt4FhAic",
    status: "REPLAY",
    excerpt: "Media access case replay."
  },
  {
    id: "1EsBpGAFCgIks6vamfnQ4ObJgviKd0y9_eXPhr2suWnY",
    title: "Supreme Seymour Prime \u2014 CourtListener Daily Replay \u2014 2026-09-23",
    modified: "2026-09-23T19:37:11Z",
    href: "https://docs.google.com/document/d/1EsBpGAFCgIks6vamfnQ4ObJgviKd0y9_eXPhr2suWnY",
    status: "REPLAY",
    excerpt: "CourtListener daily replay."
  },
  {
    id: "1bwaYRJrCC1oja65z3cSs8f2CEizOV-HCN-7L8Txqa9E",
    title: "Supreme Seymour Recursive Learning Flywheel V0.1 \u2014 Operator Manual",
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
  }
];

// src/drive-live.ts
function b64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(b64url, "b64url");
async function importPrivateKey(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
__name(importPrivateKey, "importPrivateKey");
async function getAccessToken(sa) {
  const iat = Math.floor(Date.now() / 1e3);
  const exp = iat + 3600;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat,
    exp,
    scope: "https://www.googleapis.com/auth/drive.readonly"
  }));
  const unsigned = `${header}.${payload}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!res.ok) throw new Error(`TOKEN_EXCHANGE_FAILED:${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("NO_ACCESS_TOKEN");
  return data.access_token;
}
__name(getAccessToken, "getAccessToken");
function inferStatus(name) {
  const n = name.toUpperCase();
  if (n.includes("DESIGN_HOLD") || n.includes("HOLD")) return "DESIGN_HOLD";
  if (n.includes("AUDIT")) return "AUDIT_CHECKPOINT";
  if (n.includes("PROTOCOL")) return "PROTOCOL";
  if (n.includes("SPEC")) return "SPEC";
  if (n.includes("REPLAY")) return "REPLAY";
  if (n.includes("MANUAL")) return "MANUAL";
  if (n.includes("CONSTITUTIONAL")) return "SYSTEM";
  return "DRIVE";
}
__name(inferStatus, "inferStatus");
async function fetchLiveDrivePointers(env) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (!env.GOOGLE_SERVICE_ACCOUNT) {
    return {
      source: "SNAPSHOT",
      pointers: DRIVE_POINTERS,
      fetchedAt: DRIVE_SNAPSHOT_DATE,
      error: "GOOGLE_SERVICE_ACCOUNT_NOT_SET"
    };
  }
  try {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
    if (!sa.client_email || !sa.private_key) throw new Error("INVALID_SERVICE_ACCOUNT");
    const token = await getAccessToken(sa);
    const q = encodeURIComponent("name contains 'Seymour' or name contains 'SEYMOUR'");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,webViewLink)&pageSize=25&orderBy=modifiedTime desc`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`DRIVE_LIST_FAILED:${res.status}`);
    const data = await res.json();
    const files = data.files || [];
    const pointers = files.map((f) => ({
      id: f.id,
      title: f.name,
      modified: f.modifiedTime,
      href: f.webViewLink || `https://docs.google.com/document/d/${f.id}`,
      status: inferStatus(f.name),
      excerpt: "Live Drive listing \u2014 excerpt not fetched"
    }));
    return {
      source: "LIVE",
      pointers,
      fetchedAt: now
    };
  } catch (e) {
    return {
      source: "SNAPSHOT",
      pointers: DRIVE_POINTERS,
      fetchedAt: DRIVE_SNAPSHOT_DATE,
      error: e instanceof Error ? e.message : "DRIVE_LIVE_FAILED"
    };
  }
}
__name(fetchLiveDrivePointers, "fetchLiveDrivePointers");

// src/project-index.ts
async function buildProjectIndex(env) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const unfinished = await listUnfinished(env);
  const drive = await fetchLiveDrivePointers(env);
  const workerEntries = unfinished.map((m) => ({
    id: m.missionId,
    source: "MISSION_STATE",
    status: m.status,
    lastStep: m.lastStep,
    updatedAt: m.timestamp,
    revision: m.revision,
    title: m.missionId,
    note: "Durable Object checkpoint"
  }));
  const externalEntries = drive.pointers.map((p) => ({
    id: p.id,
    source: "EXTERNAL_POINTER",
    status: p.status,
    lastStep: "drive-document",
    updatedAt: Date.parse(p.modified),
    revision: null,
    title: p.title,
    note: drive.source === "LIVE" ? "Live Google Drive listing" : "Google Drive snapshot \u2014 live connector unavailable",
    href: p.href,
    excerpt: p.excerpt
  }));
  const actionable = workerEntries.filter(
    (e) => e.status === "STARTED" || e.status === "IN_PROGRESS" || e.status === "HOLD"
  ).length;
  return {
    schema: "SEYMOUR_PROJECT_INDEX_V1",
    generatedAt: now,
    worker: {
      unfinished: workerEntries,
      count: workerEntries.length,
      note: workerEntries.length === 0 ? "No unfinished missions in Durable Object. Storage is empty or all work is DELIVERED." : "Unfinished missions from MISSION_STATE. These are the records Seymour can resume."
    },
    external: {
      pointers: externalEntries,
      count: externalEntries.length,
      source: drive.source,
      snapshotDate: drive.fetchedAt,
      note: drive.source === "LIVE" ? "Live Drive API response." : "Fell back to committed snapshot. Set GOOGLE_SERVICE_ACCOUNT secret and share files with the service account to enable live sync.",
      ...drive.error ? { error: drive.error } : {}
    },
    wheelOfWisdom: WHEEL_OF_WISDOM,
    math: wheelCoverage(workerEntries.length, externalEntries.length),
    summary: {
      total: workerEntries.length + externalEntries.length,
      actionable,
      externalCount: externalEntries.length,
      driveLive: drive.source === "LIVE"
    }
  };
}
__name(buildProjectIndex, "buildProjectIndex");

// src/recovery-operator.ts
var RECOVERY_OPERATOR_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Seymour | Recovery Proof</title>
<link rel="stylesheet" href="/recovery/operator.css">
<script src="/recovery/operator.js" defer><\/script>
</head>
<body>
<main>
<header><span class="eyebrow">SEYMOUR \xB7 ZERO TRUST</span><h1>Recovery proof</h1><p>Run an authenticated, synthetic checkpoint test. No tokens leave your browser.</p></header>
<section aria-label="Status" class="panel">
<h2>Persistence acceptance gate</h2>
<p>Step 1 writes <strong>STARTED</strong>, reloads it, updates to <strong>IN_PROGRESS</strong>, and confirms revision 2.</p>
<button id="run" type="button">Run authenticated round-trip</button>
<p>Step 2 reads the same checkpoint from a separate browser session.</p>
<button id="fresh" type="button" hidden>Verify independent readback</button>
<p id="link-holder" hidden>Open this link in a new private browser session, sign in with Cloudflare Access, then select \u201CVerify independent readback\u201D: <a id="fresh-link" rel="noreferrer">Open fresh-session verifier</a></p>
<pre id="report" role="status" aria-live="polite">{ "status": "NOT_RUN" }</pre>
</section>
<footer>All writes use synthetic test data. An authenticated browser session, not a copied session cookie, supplies identity.</footer>
</main>
</body>
</html>`;
var RECOVERY_OPERATOR_CSS = `
:root { color-scheme: dark; font-family: ui-sans-serif,system-ui,-apple-system,sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100dvh; background: radial-gradient(circle at top right,#152b45,#070e18 55%); color: #ecf3ff; }
main { max-width: 800px; margin: 0 auto; padding: 48px 20px; }
.eyebrow { color: #73deca; font-size: 12px; font-weight: 800; letter-spacing: .13em; }
h1 { font-size: clamp(36px,7vw,64px); letter-spacing: -.04em; margin: 9px 0; }
h2 { font-size: 20px; margin-top: 0; }
p { line-height: 1.55; color: #bdcadb; }
.panel { margin-top: 36px; padding: 28px; border: 1px solid #38516d; border-radius: 18px; background: #101e30; }
button { display: block; width: 100%; padding: 15px 20px; margin-top: 18px; border: 0; border-radius: 10px; background: #6ce5cc; color: #061521; font: inherit; font-weight: 750; cursor: pointer; }
button:disabled { opacity: .6; cursor: progress; }
button[hidden],p[hidden] { display: none; }
a { color: #72ebd4; overflow-wrap: anywhere; }
pre { margin-top: 25px; padding: 20px; background: #050c15; border: 1px solid #354b65; border-radius: 10px; color: #bbeddc; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
footer { margin-top: 26px; font-size: 13px; color: #92a6bf; }
`;
var RECOVERY_OPERATOR_JS = `
"use strict";
const report = document.getElementById("report");
const run = document.getElementById("run");
const fresh = document.getElementById("fresh");
const freshLink = document.getElementById("fresh-link");
const linkHolder = document.getElementById("link-holder");
const params = new URLSearchParams(location.search);
const existingId = params.get("missionId");
const expectedMarker = params.get("marker");
const write = (value) => { report.textContent = JSON.stringify(value, null, 2); };
const readJSON = async (path, options) => {
  const res = await fetch(path, { credentials:"same-origin", cache:"no-store", redirect:"error", ...options });
  const body = await res.json();
  if (!res.ok) throw new Error("HTTP " + res.status + " " + String(body.error || body.note || "request failed"));
  return body;
};
const verify = (record,id,marker,status,revision) => {
  if (!record || record.missionId !== id || record.status !== status ||
      record.revision !== revision || record.payload?.probeMarker !== marker)
    throw new Error("Checkpoint readback mismatch: expected " + status + " revision " + revision);
};
if (existingId && expectedMarker && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(existingId) &&
    /^[a-f0-9-]{36}$/.test(expectedMarker)) {
  fresh.hidden = false;
  run.hidden = true;
  fresh.addEventListener("click", async () => {
    fresh.disabled = true;
    write({ status:"CHECKING", missionId:existingId, check:"fresh-read" });
    try {
      const persisted = await readJSON("/recovery/load/" + encodeURIComponent(existingId));
      verify(persisted, existingId, expectedMarker, "IN_PROGRESS", 2);
      write({status:"FRESH_READ_PASS",missionId:existingId,revision:persisted.revision,
        state:persisted.status,proof:"Cloudflare Access authenticated readback from this browser",
        separateBrowserSession:"USER_MUST_CONFIRM"});
    } catch (err) {
      write({status:"FAIL",stage:"fresh-read",missionId:existingId,error:String(err)});
    } finally { fresh.disabled = false; }
  });
}
run.addEventListener("click", async () => {
  run.disabled = true;
  linkHolder.hidden = true;
  const missionId = "seymour-proof-" + crypto.randomUUID();
  const probeMarker = crypto.randomUUID();
  const checkpoint = (status,lastStep) => ({
    missionId,status,lastStep,payload:{synthetic:true,probeMarker,kind:"SEYMOUR_ACCESS_RECOVERY_PROOF_V1"},
    timestamp:Date.now(),note:"Synthetic authenticated recovery test; no user secrets"
  });
  write({status:"RUNNING",missionId});
  try {
    const created = await readJSON("/recovery/save", {
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(checkpoint("STARTED","initial-write"))
    });
    if (!created.saved || created.revision !== 1) throw new Error("Initial save did not return revision 1");
    verify(await readJSON("/recovery/load/" + encodeURIComponent(missionId)),
      missionId,probeMarker,"STARTED",1);
    const advanced = await readJSON("/recovery/save", {
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(checkpoint("IN_PROGRESS","second-write"))
    });
    if (!advanced.saved || advanced.revision !== 2) throw new Error("Second save did not return revision 2");
    verify(await readJSON("/recovery/load/" + encodeURIComponent(missionId)),
      missionId,probeMarker,"IN_PROGRESS",2);
    const unfinished = await readJSON("/recovery/unfinished");
    if (!Array.isArray(unfinished.unfinished) ||
        !unfinished.unfinished.some(x => x.missionId === missionId && x.revision === 2))
      throw new Error("Checkpoint missing from unfinished registry");
    const next = new URL("/recovery/operator",location.origin);
    next.searchParams.set("missionId",missionId);
    next.searchParams.set("marker",probeMarker);
    freshLink.href=next.href;
    linkHolder.hidden=false;
    write({status:"AUTHENTICATED_ROUNDTRIP_PASS",missionId,revisions:[1,2],
      unfinishedRegistry:"PASS",freshSession:"PENDING",
      nextStep:"Open the provided link in a new private browser session."});
  } catch (err) {
    write({status:"FAIL",missionId,error:String(err)});
  } finally {run.disabled = false;}
});
`;
var RECOVERY_OPERATOR_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

// src/mission-state.ts
import { DurableObject } from "cloudflare:workers";
var VALID = /* @__PURE__ */ new Set(["STARTED", "IN_PROGRESS", "DELIVERED", "HOLD", "FAILED"]);
var MAX_BYTES = 64 * 1024;
var MissionState = class extends DurableObject {
  static {
    __name(this, "MissionState");
  }
  constructor(ctx, env) {
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
  async save(checkpoint) {
    if (!checkpoint || typeof checkpoint.missionId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(checkpoint.missionId) || !VALID.has(checkpoint.status) || typeof checkpoint.lastStep !== "string" || checkpoint.lastStep.length > 512 || typeof checkpoint.note !== "string" || checkpoint.note.length > 4096) {
      throw new Error("INVALID_CHECKPOINT");
    }
    let payload;
    try {
      payload = JSON.stringify(checkpoint.payload ?? null);
    } catch {
      throw new Error("INVALID_PAYLOAD");
    }
    if (new TextEncoder().encode(payload).byteLength > MAX_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `
      INSERT INTO checkpoints(mission_id,status,last_step,payload,timestamp,note,revision,updated_at)
      VALUES(?,?,?,?,?,?,1,?)
      ON CONFLICT(mission_id) DO UPDATE SET
        status=excluded.status,last_step=excluded.last_step,payload=excluded.payload,
        timestamp=excluded.timestamp,note=excluded.note,
        revision=checkpoints.revision+1,updated_at=excluded.updated_at
    `,
      checkpoint.missionId,
      checkpoint.status,
      checkpoint.lastStep,
      payload,
      now,
      checkpoint.note,
      now
    );
    const result = this.ctx.storage.sql.exec(
      "SELECT revision FROM checkpoints WHERE mission_id = ?",
      checkpoint.missionId
    ).one();
    return { saved: true, missionId: checkpoint.missionId, revision: result.revision, updatedAt: now };
  }
  async load(missionId) {
    const rows = this.ctx.storage.sql.exec(
      "SELECT * FROM checkpoints WHERE mission_id = ?",
      missionId
    ).toArray();
    const r = rows[0];
    if (!r) return null;
    return {
      missionId: String(r.mission_id),
      status: r.status,
      lastStep: String(r.last_step),
      payload: JSON.parse(String(r.payload)),
      timestamp: Number(r.timestamp),
      note: String(r.note),
      revision: Number(r.revision)
    };
  }
  async unfinished(limit = 100) {
    const n = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 100;
    return this.ctx.storage.sql.exec(
      "SELECT mission_id,status,last_step,updated_at,revision FROM checkpoints WHERE status IN ('STARTED','IN_PROGRESS','HOLD','FAILED') ORDER BY updated_at DESC LIMIT ?",
      n
    ).toArray().map((r) => ({
      missionId: String(r.mission_id),
      status: String(r.status),
      lastStep: String(r.last_step),
      timestamp: Number(r.updated_at),
      revision: Number(r.revision)
    }));
  }
};

// src/task-ledger.ts
import { DurableObject as DurableObject2 } from "cloudflare:workers";
var TaskLedger = class extends DurableObject2 {
  static {
    __name(this, "TaskLedger");
  }
  constructor(ctx, env) {
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
  async createOrReuseTask(task) {
    const existing = this.ctx.storage.sql.exec(
      "SELECT * FROM tasks WHERE hash = ?",
      task.hash
    ).toArray()[0];
    if (existing) {
      return this.rowToTask(existing);
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const full = {
      ...task,
      id,
      outcome: task.outcome || "PENDING",
      createdAt: now,
      updatedAt: now
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO tasks (id, requestId, type, query, provenance, dependencies, costBudget, outcome, result, hash, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      full.id,
      full.requestId,
      full.type,
      full.query,
      full.provenance,
      JSON.stringify(full.dependencies),
      full.costBudget,
      full.outcome,
      full.result ? JSON.stringify(full.result) : null,
      full.hash,
      full.createdAt,
      full.updatedAt
    );
    return full;
  }
  async updateOutcome(id, outcome, result) {
    this.ctx.storage.sql.exec(
      "UPDATE tasks SET outcome = ?, result = ?, updatedAt = ? WHERE id = ?",
      outcome,
      result ? JSON.stringify(result) : null,
      Date.now(),
      id
    );
  }
  async getProgressSummary(requestId) {
    const rows = this.ctx.storage.sql.exec(
      "SELECT outcome, COUNT(*) AS count FROM tasks WHERE requestId = ? GROUP BY outcome",
      requestId
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
  async getTasksForRequest(requestId) {
    const rows = this.ctx.storage.sql.exec(
      "SELECT * FROM tasks WHERE requestId = ?",
      requestId
    ).toArray();
    return rows.map(this.rowToTask);
  }
  async getEvidenceGraph(requestId) {
    const tasks = await this.getTasksForRequest(requestId);
    const stats = {
      total: tasks.length,
      pass: tasks.filter((t) => t.outcome === "PASS").length,
      fail: tasks.filter((t) => t.outcome === "FAIL").length,
      unknown: tasks.filter((t) => t.outcome === "UNKNOWN").length,
      pending: tasks.filter((t) => t.outcome === "PENDING").length
    };
    return { tasks, stats };
  }
  rowToTask(row) {
    return {
      id: row.id,
      requestId: row.requestId,
      type: row.type,
      query: row.query,
      provenance: row.provenance,
      dependencies: JSON.parse(row.dependencies || "[]"),
      costBudget: row.costBudget,
      outcome: row.outcome,
      result: row.result ? JSON.parse(row.result) : void 0,
      hash: row.hash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
};

// src/investigation-workflow.ts
import { WorkflowEntrypoint } from "cloudflare:workers";
var InvestigationWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "InvestigationWorkflow");
  }
  async run(event, step) {
    const { requestId, question } = event.payload;
    const stub = this.env.TASK_LEDGER.getByName(requestId);
    await step.do("record-start", async () => ({
      requestId,
      question,
      startedAt: Date.now(),
      note: "No conclusions are authorized by Workflow execution."
    }));
    const initial = await step.do("initial-progress", () => stub.getProgressSummary(requestId));
    let signal = "already-settled";
    if (initial.total > 0 && initial.pending > 0) {
      try {
        const notification = await step.waitForEvent(
          "wait-for-tasks-settled",
          { type: "tasks-settled", timeout: "10 minutes" }
        );
        if (notification.payload?.requestId !== requestId || notification.payload?.source !== "task-queue" || notification.payload?.kind !== "tasks-settled") {
          signal = "timeout";
        } else {
          signal = "tasks-settled";
        }
      } catch {
        signal = "timeout";
      }
    }
    return step.do("final-reconciliation", async () => {
      const finalStats = await stub.getProgressSummary(requestId);
      return {
        requestId,
        question,
        finalStats,
        signal,
        completedAt: Date.now(),
        status: finalStats.total > 0 && finalStats.pending === 0 ? "COMPLETE" : "PARTIAL",
        note: "COMPLETE means tasks settled, not claims verified. Simulated outcomes are not factual PASS. Human review required."
      };
    });
  }
};

// src/control-desk.ts
async function handleControlDesk(request) {
  if (request.method !== "POST") {
    return new Response("POST /control-desk with { mission, scope?, roles?, dryRun? }", { status: 405 });
  }
  const body = await request.json();
  if (!body.mission || body.mission.trim().length === 0) {
    return Response.json({
      status: "REJECTED",
      note: "Mission text required"
    }, { status: 400 });
  }
  const missionId = crypto.randomUUID();
  const receipt = {
    missionId,
    status: body.dryRun === false ? "HOLD" : "ACCEPTED",
    timestamp: Date.now(),
    note: body.dryRun === false ? "Live execution requires explicit human authorization. Defaulting to dry-run acceptance." : "Mission accepted under constitutional autonomy (research / draft / test / log). Production and credentials remain gated.",
    next: "Internal delegation and drafting may proceed. Review output in control desk."
  };
  return Response.json(receipt);
}
__name(handleControlDesk, "handleControlDesk");

// src/message-bus.ts
async function sendDirect(env, toBinding, payload) {
  return Response.json({
    status: "HOLD",
    note: "Service Binding not yet configured. Declare in wrangler.jsonc when agents are available.",
    to: toBinding,
    payload
  }, { status: 501 });
}
__name(sendDirect, "sendDirect");
async function enqueueAsync(env, msg) {
  if (!env.BUS_QUEUE) {
    return { error: "BUS_QUEUE not bound" };
  }
  const full = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: Date.now()
  };
  await env.BUS_QUEUE.send(full);
  return { id: full.id };
}
__name(enqueueAsync, "enqueueAsync");
async function updateSharedState(env, key, value) {
  if (!env.MISSION_STATE) {
    return new Response("MISSION_STATE Durable Object not bound", { status: 501 });
  }
  return Response.json({
    status: "HOLD",
    note: "Durable Object state update stubbed. Implement MissionState class when ready.",
    key,
    value
  }, { status: 501 });
}
__name(updateSharedState, "updateSharedState");

// src/index.ts
var DEFAULT_LOGICAL_TASKS = 73e3;
var TASKS_PER_BATCH = 270;
var AGENT_TYPES = ["source", "audit", "math", "legal", "replay", "receipt"];
function isAllowlisted(email, allowlist) {
  if (!email || !allowlist) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.split(",").some((s) => s.trim().toLowerCase() === normalized);
}
__name(isAllowlisted, "isAllowlisted");
function hasRoutePermission(pathname, email, env) {
  if (!isAllowlisted(email, env.ACCESS_ALLOWLIST)) return false;
  const recovery = pathname === "/recovery/save" || pathname === "/recovery/unfinished" || pathname === "/recovery/operator" || pathname === "/recovery/operator.js" || pathname === "/recovery/operator.css" || pathname === "/recovery/probe-now" || pathname === "/recovery/index" || pathname === "/recovery/live" || pathname === "/recovery/live/status" || pathname === "/recovery/live.js" || pathname === "/recovery/live.css" || pathname.startsWith("/recovery/load/");
  if (recovery) return true;
  const orchestration = pathname === "/investigate" || pathname === "/control-desk" || pathname.startsWith("/graph/") || pathname.startsWith("/workflow/") || pathname.startsWith("/bus/");
  return orchestration && isAllowlisted(email, env.ACCESS_ORCHESTRATION_ALLOWLIST);
}
__name(hasRoutePermission, "hasRoutePermission");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ service: "seymour-swarm-orchestrator", status: "UP", verified: "transport-only", version: "0.4" });
    }
    const isPublic = url.pathname === "/comms/who" && request.method === "GET" || url.pathname === "/simulator/status" && request.method === "GET";
    if (!isPublic) {
      const hasAccess = !!ctx.access;
      const hasBearer = !!(env.CONTROL_DESK_TOKEN && request.headers.get("Authorization") === "Bearer " + env.CONTROL_DESK_TOKEN);
      if (!hasAccess && !hasBearer) {
        return Response.json(
          { error: "AUTH_REQUIRED", note: "Cloudflare Access or authenticated private gateway required." },
          { status: 401 }
        );
      }
      if (hasAccess && ctx.access) {
        let email;
        try {
          const identity = await ctx.access.getIdentity();
          email = identity?.email;
        } catch {
          return Response.json({ error: "ACCESS_IDENTITY_UNAVAILABLE" }, { status: 403 });
        }
        if (!hasRoutePermission(url.pathname, email, env)) {
          return Response.json(
            { error: "FORBIDDEN", note: "Identity lacks permission for this operation." },
            { status: 403 }
          );
        }
      }
    }
    if (request.method === "GET" && url.pathname === "/recovery/index") {
      const index = await buildProjectIndex(env);
      return Response.json(index, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "GET" && url.pathname === "/recovery/live") {
      return new Response(LIVE_DESK_HTML, { headers: LIVE_HEADERS });
    }
    if (request.method === "GET" && url.pathname === "/recovery/live.js") {
      return new Response(LIVE_DESK_JS, { headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      } });
    }
    if (request.method === "GET" && url.pathname === "/recovery/live.css") {
      return new Response(LIVE_DESK_CSS, { headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      } });
    }
    if (request.method === "GET" && url.pathname === "/recovery/live/status") {
      return Response.json(await readLiveRecoveryStatus(env), { headers: {
        "Cache-Control": "no-store, private"
      } });
    }
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/recovery/probe-now") {
      const result = await runAutomatedPersistenceProbe(env);
      return Response.json(result, {
        status: result.result === "PASS" ? 200 : 202,
        headers: { "Cache-Control": "no-store" }
      });
    }
    if (request.method === "GET" && url.pathname === "/recovery/operator") {
      return new Response(RECOVERY_OPERATOR_HTML, { headers: RECOVERY_OPERATOR_HEADERS });
    }
    if (request.method === "GET" && url.pathname === "/recovery/operator.js") {
      return new Response(RECOVERY_OPERATOR_JS, { headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      } });
    }
    if (request.method === "GET" && url.pathname === "/recovery/operator.css") {
      return new Response(RECOVERY_OPERATOR_CSS, { headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      } });
    }
    if (url.pathname === "/comms/who" && request.method === "GET") {
      return Response.json(COMMS_DIRECTORY);
    }
    if (url.pathname === "/control-desk" && request.method === "POST") {
      return handleControlDesk(request);
    }
    if (url.pathname === "/bus/enqueue" && request.method === "POST") {
      const body = await request.json();
      const result = await enqueueAsync(env, {
        from: body.from || "control-desk",
        to: body.to || "unknown",
        type: "async",
        payload: body.payload
      });
      return Response.json(result);
    }
    if (url.pathname === "/bus/direct" && request.method === "POST") {
      const body = await request.json();
      return sendDirect(env, body.toBinding || "EXAMPLE_AGENT", body.payload);
    }
    if (url.pathname === "/bus/state" && request.method === "POST") {
      const body = await request.json();
      return updateSharedState(env, body.key || "default", body.value);
    }
    if (url.pathname === "/recovery/save" && request.method === "POST") {
      const body = await request.json();
      try {
        const result = await saveCheckpoint(env, body);
        return Response.json(result, { status: result.saved ? 200 : 503 });
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "SAVE_FAILED" }, { status: 400 });
      }
    }
    if (url.pathname.startsWith("/recovery/load/") && request.method === "GET") {
      const missionId = url.pathname.split("/")[3];
      const checkpoint = await loadCheckpoint(env, missionId);
      return Response.json(checkpoint ?? { note: "No checkpoint found or state not bound" });
    }
    if (url.pathname === "/recovery/unfinished" && request.method === "GET") {
      const ids = await listUnfinished(env);
      return Response.json({ unfinished: ids });
    }
    if (url.pathname === "/investigate" && request.method === "POST") {
      const body = await request.json();
      const requestId = body.requestId || crypto.randomUUID();
      const logicalCount = Math.min(body.logicalTaskCount ?? DEFAULT_LOGICAL_TASKS, 1e5);
      const dryRun = body.dryRun === true;
      if (!dryRun && logicalCount > 3e3) {
        return Response.json({
          error: "FREE_TIER_EXECUTION_GUARD",
          message: "Live execution capped at 3,000 tasks/request (~9,000 Queue operations). Use dryRun:true for the 73,000-task simulator.",
          logicalTasks: logicalCount,
          note: "This is a design guard, not a verified account-level quota check."
        }, { status: 422 });
      }
      const useWorkflow = body.useWorkflow === true;
      const stub = env.TASK_LEDGER.getByName(requestId);
      const logicalTasks = [];
      for (let i = 0; i < logicalCount; i++) {
        const agentType = AGENT_TYPES[i % AGENT_TYPES.length];
        const subQuery = `${body.question} :: facet-${i % 1e3} :: ${agentType}`;
        logicalTasks.push({
          type: agentType,
          query: subQuery,
          provenance: "user-request",
          dependencies: i > 10 ? [`dep-${Math.floor(i / 50)}`] : [],
          costBudget: i % 5 + 1,
          hash: await hashStr(subQuery + agentType)
        });
      }
      const created = [];
      const batches = [];
      let currentBatch = [];
      for (const t of logicalTasks) {
        const task = await stub.createOrReuseTask({
          requestId,
          type: t.type,
          query: t.query,
          provenance: t.provenance,
          dependencies: t.dependencies,
          costBudget: t.costBudget,
          hash: t.hash
        });
        created.push(task);
        currentBatch.push({
          taskId: task.id,
          requestId,
          type: task.type,
          query: task.query,
          batchHint: Math.floor(created.length / TASKS_PER_BATCH)
        });
        if (currentBatch.length >= TASKS_PER_BATCH) {
          batches.push(currentBatch);
          currentBatch = [];
        }
      }
      if (currentBatch.length > 0) batches.push(currentBatch);
      let workflowInstanceId;
      if (useWorkflow && !dryRun) {
        const instance = await env.INVESTIGATION_WORKFLOW.create({
          id: `inv-${requestId}`,
          params: { requestId, question: body.question, logicalTaskCount: logicalCount }
        });
        workflowInstanceId = instance.id;
      }
      if (!dryRun) {
        for (const batch of batches) {
          for (let i = 0; i < batch.length; i += 100) {
            const sub = batch.slice(i, i + 100);
            await env.TASK_QUEUE.sendBatch(sub.map((msg) => ({ body: msg })));
          }
        }
      }
      const requiredBatches = Math.ceil(logicalCount / TASKS_PER_BATCH);
      const estimatedOps = logicalCount * 3;
      const freeTierOpsPerDay = 1e4;
      return Response.json({
        requestId,
        workflowInstanceId,
        message: dryRun ? "Dry-run complete. No queue messages sent." : useWorkflow ? "Investigation started with Workflow for long-running monitoring. Tasks tracked in durable ledger. Batches queued." : "Investigation started. Tasks tracked in durable ledger. Batches queued.",
        simulator: {
          logicalTasks: logicalCount,
          tasksPerBatch: TASKS_PER_BATCH,
          requiredBatches,
          uniqueTasksCreated: created.length,
          estimatedQueueOps: estimatedOps,
          freeTierOpsRemainingEstimate: Math.max(0, freeTierOpsPerDay - estimatedOps),
          note: "Conceptual batching. Actual execution respects CPU, subrequest, storage, and queue limits. ~3 ops per message. Workflow steps counted separately (free tier: 3,000/day). Simulator outcomes are not evidence of real agent research."
        },
        note: "No Cloudflare billing upgrade or deployment performed. Read-only by default. Humans retain publication/legal authority."
      });
    }
    if (url.pathname.startsWith("/graph/") && request.method === "GET") {
      const requestId = url.pathname.split("/")[2];
      const stub = env.TASK_LEDGER.getByName(requestId);
      const graph = await stub.getEvidenceGraph(requestId);
      return Response.json({
        requestId,
        ...graph,
        architecture: "SEYMOUR SWARM v0.2 - JSON Evidence Graph: Deduplicate \u2022 Verify \u2022 Reconcile \u2022 Replay"
      });
    }
    if (url.pathname.startsWith("/workflow/") && request.method === "GET") {
      const instanceId = url.pathname.split("/")[2];
      try {
        const instance = await env.INVESTIGATION_WORKFLOW.get(instanceId);
        const status = await instance.status();
        return Response.json({ instanceId, status });
      } catch (e) {
        return Response.json({ error: "Workflow instance not found or not yet available", instanceId }, { status: 404 });
      }
    }
    if (url.pathname === "/simulator/status") {
      return Response.json({
        version: "0.4-recovery",
        defaults: {
          logicalTasks: DEFAULT_LOGICAL_TASKS,
          tasksPerBatch: TASKS_PER_BATCH,
          requiredBatches: Math.ceil(DEFAULT_LOGICAL_TASKS / TASKS_PER_BATCH),
          agentTypes: AGENT_TYPES
        },
        freeTier: {
          queueOpsPerDay: 1e4,
          workflowStepsPerDay: 3e3,
          concurrentWorkflowInstances: 100,
          note: "Messages typically consume 3 operations each (write/read/delete). Workflow steps are billed separately."
        }
      });
    }
    return new Response("SEYMOUR SWARM ORCHESTRATOR v0.4\nGET /recovery/index\nGET /recovery/live\nPOST /control-desk {mission, scope?, roles?, dryRun?}\nPOST /bus/enqueue {from, to, payload}\nPOST /bus/direct {toBinding, payload}\nPOST /bus/state {key, value}\nPOST /recovery/save {missionId, status, lastStep, payload, timestamp, note}\nGET /recovery/load/{missionId}\nGET /recovery/unfinished\nGET /recovery/probe-now\nPOST /investigate {question, logicalTaskCount?, dryRun?, useWorkflow?}\nGET /graph/{requestId}\nGET /workflow/{instanceId}\nGET /simulator/status", { status: 200 });
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil((async () => {
      const result = await runAutomatedPersistenceProbe(env, Date.now(), "scheduled");
      console.log(JSON.stringify({
        event: "SEYMOUR_AUTOMATED_PERSISTENCE_V1",
        result: result.result,
        priorRunVerified: result.priorRunVerified,
        currentRoundtripVerified: result.currentRoundtripVerified,
        revision: result.revision,
        at: result.at,
        error: result.error ?? null
      }));
      if (result.result !== "PASS" && result.error !== "PREVIOUS_RUN_NOT_VERIFIED") {
        throw Error("SEYMOUR_AUTOMATED_PERSISTENCE_FAILED:" + result.error);
      }
    })());
  },
  async queue(batch, env) {
    const touched = /* @__PURE__ */ new Set();
    for (const msg of batch.messages) {
      const { taskId, requestId, type, query } = msg.body;
      const stub = env.TASK_LEDGER.getByName(requestId);
      const outcome = "UNKNOWN";
      await stub.updateOutcome(taskId, outcome, {
        simulated: true,
        note: "Simulator outcome. Not evidence of real agent execution.",
        processedInBatch: true
      });
      msg.ack();
      touched.add(requestId);
    }
    for (const requestId of touched) {
      const stub = env.TASK_LEDGER.getByName(requestId);
      const stats = await stub.getProgressSummary(requestId);
      if (stats.total > 0 && stats.pending === 0) {
        try {
          const instance = await env.INVESTIGATION_WORKFLOW.get(`inv-${requestId}`);
          await instance.sendEvent({
            type: "tasks-settled",
            payload: { requestId, source: "task-queue", kind: "tasks-settled" }
          });
        } catch {
        }
      }
    }
  }
};
async function hashStr(s) {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashStr, "hashStr");
export {
  InvestigationWorkflow,
  MissionState,
  TaskLedger,
  index_default as default,
  hasRoutePermission
};
//# sourceMappingURL=index.js.map
