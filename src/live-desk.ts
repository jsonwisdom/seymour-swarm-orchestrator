import type { Env } from "./index";
import { loadCheckpoint, listUnfinished } from "./recovery";
import { AUTO_PROBE_ID } from "./auto-persistence";

const HISTORY_ID = "seymour-previous-probe-v1";
const STALE_AFTER_MS = 26 * 60 * 60 * 1000;
type RecordShape = { missionId:string; status:string; revision:number; payload:unknown; timestamp:number; note:string };

export async function readLiveRecoveryStatus(env: Env, now = Date.now()) {
  const [latest, history, unfinished] = await Promise.all([
    loadCheckpoint(env, AUTO_PROBE_ID),
    loadCheckpoint(env, HISTORY_ID),
    listUnfinished(env),
  ]);
  const latestRun = latest as RecordShape | null;
  const priorReceipt = history as RecordShape | null;
  const p = priorReceipt?.payload as { runId?:string;revision?:number;timestamp?:number;marker?:string; result?: "PASS" | "FAIL"; source?: "operator" | "scheduled" } | undefined;
  const l = latestRun?.payload as { runId?:string;marker?:string } | undefined;
  const ageMs = typeof p?.timestamp === "number" && p.timestamp <= now ? now-p.timestamp : null;
  const validReceipt = !!(latestRun && priorReceipt &&
    latestRun.status === "DELIVERED" && priorReceipt.status === "DELIVERED" &&
    p?.runId && p.runId === l?.runId &&
    p.revision === latestRun.revision &&
    p.marker === "seymour-cron-storage-proof");
  // Last recorded run's state alone cannot prove a previous run survived.
  const verdict: "UNKNOWN"|"STALE"|"BASELINE_ONLY"|"PASS"|"FAIL" = !validReceipt ? "UNKNOWN" :
    ageMs !== null && ageMs > STALE_AFTER_MS ? "STALE" :
    p?.result === "PASS" ? "PASS" :
    p?.result === "FAIL" ? "FAIL" : "BASELINE_ONLY";
  const otherUnfinished = unfinished.filter(x=> !x.missionId.startsWith("seymour-proof-") &&
    x.missionId !== AUTO_PROBE_ID && x.missionId !== HISTORY_ID);
  return {
    schema:"SEYMOUR_LIVE_STATUS_V1",
    observedAt:new Date(now).toISOString(),
    service:"seymour-swarm-orchestrator",
    persistence:{verdict,receiptConsistent:validReceipt,
      lastRecordedAt:typeof p?.timestamp === "number" ? new Date(p.timestamp).toISOString():null,
      ageMinutes:ageMs===null?null:Math.floor(ageMs/60000),
      latestRevision:latestRun?.revision??null,
      runSource:p?.source??"UNKNOWN",
      scheduledCrossRunPass:validReceipt && p?.source==="scheduled" && p?.result==="PASS",
      note:validReceipt ?
        "Durable receipts agree. Displayed verdict is from the recorded run; runSource identifies whether it was a cron or operator test." :
        "No mutually consistent durable probe receipts observed."},
    scheduled:{cron:"17 10 * * *",timezone:"UTC",verification:"Configured; runtime delivery not inferred from schedule"},
    recovery:{unfinishedCount:otherUnfinished.length,
      sample:otherUnfinished.slice(0,12).map(x=>({missionId:x.missionId,status:x.status,
        revision:x.revision,lastStep:x.lastStep}))},
    boundaries:{externalSourceSync:"NOT_IMPLEMENTED",autonomousProjectRecovery:"NOT_VERIFIED"}
  };
}

export const LIVE_DESK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Seymour LIVE | Recovery Control Desk</title>
<link rel="stylesheet" href="/recovery/live.css"><script src="/recovery/live.js" defer></script></head>
<body><main>
<div class="top"><span class="eyebrow">SEYMOUR · LIVE CONTROL DESK</span><span class="secure">CLOUDFLARE ACCESS · OPERATOR</span></div>
<h1>Recovery, without starting over.</h1>
<p class="subtitle">Live durable-state evidence, not guesses. Private, read-only by default.</p>
<div class="metrics">
<section><span>Persistence</span><strong id="verdict">LOADING</strong><small id="age">No measurement yet</small></section>
<section><span>Unfinished work</span><strong id="unfinished">—</strong><small>Excludes synthetic proof missions</small></section>
<section><span>Last revision</span><strong id="revision">—</strong><small>Durable storage probe</small></section>
</div>
<div class="panels">
<section><h2>Automated storage watch</h2><p id="last">Waiting for the first verified receipt.</p><p>Schedule: daily 10:17 UTC. Dashboard refreshes every 30 seconds.</p>
<div class="actions"><button id="refresh">Refresh status</button><button id="probe">Run internal proof now</button></div>
<p class="hint">Run internal proof performs synthetic reads/writes. It never asks for PINs or creates external agent tasks.</p>
</section>
<section><h2>Resume work</h2><p>Most recent unfinished real mission records:</p><div id="missions" class="missions">Loading…</div>
<p class="hint">Records are pointers, not proof that external projects were synchronized.</p></section>
</div>
<section class="wheel">
<h2>CWaaS · Wheel of Wisdom</h2>
<p>Evidence first. The project index includes Flywheel repository provenance, JASON audit stages, x402 settlement boundaries, and coverage math.</p>
<a class="wheel-link" href="/recovery/index">Open full project index · JSON evidence</a>
<p class="hint">Runtime Drive sync and payments are not implied by a repository or snapshot.</p>
</section>
<h2>Evidence receipt</h2><pre id="receipt" role="status" aria-live="polite">Loading verified state…</pre>
<footer>PASS means a verified operation. UNKNOWN means there is not enough evidence. A schedule alone does not prove execution.</footer>
</main></body></html>`;

export const LIVE_DESK_CSS = `
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

export const LIVE_DESK_JS = `
"use strict";
const byId = id => document.getElementById(id);
const render = data => {
  byId("verdict").textContent=data.persistence.verdict;
  byId("age").textContent=data.persistence.ageMinutes===null?"No production receipt":data.persistence.ageMinutes+" minutes since recorded receipt";
  byId("revision").textContent=data.persistence.latestRevision??"—";
  byId("unfinished").textContent=data.recovery.unfinishedCount;
  byId("last").textContent=data.persistence.note + " Source: " + data.persistence.runSource;
  byId("missions").replaceChildren(...(data.recovery.sample.length ? data.recovery.sample.map(m=>{
    const box=document.createElement("div");box.className="mission";
    const name=document.createElement("b");name.textContent=m.missionId;
    const info=document.createElement("span");info.textContent=m.status+" · revision "+m.revision+" · "+m.lastStep;
    box.append(name,info);return box;
  }):[document.createTextNode("No unfinished mission pointers found.")]));
  byId("receipt").textContent=JSON.stringify(data,null,2);
};
async function request(path,method="GET") {
  const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",redirect:"error"});
  const json=await r.json();if(!r.ok && r.status!==202)throw Error("HTTP "+r.status+" "+(json.error||"request failed"));
  return json;
}
async function refresh(){try{render(await request("/recovery/live/status"))}catch(e){byId("receipt").textContent="UNKNOWN — status fetch failed: "+String(e)}}
byId("refresh").addEventListener("click",refresh);
byId("probe").addEventListener("click",async()=>{
  byId("probe").disabled=true;
  try{const result=await request("/recovery/probe-now","POST");
    byId("receipt").textContent=JSON.stringify({operation:"ON_DEMAND_PROBE",...result},null,2);
    await refresh();
  }catch(e){byId("receipt").textContent="FAIL — "+String(e)}
  finally{byId("probe").disabled=false}
});
refresh();setInterval(refresh,30000);
`;

export const LIVE_HEADERS = {
  "Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, private",
  "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
  "X-Frame-Options":"DENY",
  "Content-Security-Policy":"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};
