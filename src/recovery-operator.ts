/**
 * Human operator recovery test, served only after verified Access identity and
 * ACCESS_ALLOWLIST authorization. No cookie/OTP/service-token handling in JS.
 */
export const RECOVERY_OPERATOR_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Seymour | Recovery Proof</title>
<link rel="stylesheet" href="/recovery/operator.css">
<script src="/recovery/operator.js" defer></script>
</head>
<body>
<main>
<header><span class="eyebrow">SEYMOUR · ZERO TRUST</span><h1>Recovery proof</h1><p>Run an authenticated, synthetic checkpoint test. No tokens leave your browser.</p></header>
<section aria-label="Status" class="panel">
<h2>Persistence acceptance gate</h2>
<p>Step 1 writes <strong>STARTED</strong>, reloads it, updates to <strong>IN_PROGRESS</strong>, and confirms revision 2.</p>
<button id="run" type="button">Run authenticated round-trip</button>
<p>Step 2 reads the same checkpoint from a separate browser session.</p>
<button id="fresh" type="button" hidden>Verify independent readback</button>
<p id="link-holder" hidden>Open this link in a new private browser session, sign in with Cloudflare Access, then select “Verify independent readback”: <a id="fresh-link" rel="noreferrer">Open fresh-session verifier</a></p>
<pre id="report" role="status" aria-live="polite">{ "status": "NOT_RUN" }</pre>
</section>
<footer>All writes use synthetic test data. An authenticated browser session, not a copied session cookie, supplies identity.</footer>
</main>
</body>
</html>`;

export const RECOVERY_OPERATOR_CSS = `
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

export const RECOVERY_OPERATOR_JS = `
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

export const RECOVERY_OPERATOR_HEADERS = {
  "Content-Type":"text/html; charset=utf-8",
  "Cache-Control":"no-store, private",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
  "X-Frame-Options":"DENY",
  "Content-Security-Policy":"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
} as const;
