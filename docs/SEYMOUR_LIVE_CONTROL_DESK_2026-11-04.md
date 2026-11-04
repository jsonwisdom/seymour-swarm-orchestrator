# SEYMOUR LIVE CONTROL DESK — deployment evidence 2026-11-04

## Operator routes
- Protected dashboard: https://seymour-swarm-orchestrator.jaywisdom44.workers.dev/recovery/live
- GET /recovery/live/status is read-only; Access operator allowlist applies.
- POST /recovery/probe-now intentionally performs synthetic writes and is private.
- Private assets /recovery/live.js and /recovery/live.css; no credentials embedded.

## Changes
- src/live-desk.ts: 30-second status refresh; persisted receipt consistency and freshness; PASS/FAIL/STALE/UNKNOWN/BASELINE_ONLY; unfinished mission pointers excluding synthetic proofs; mobile responsive interface.
- src/auto-persistence.ts: durable result PASS/FAIL and source scheduled/operator added to receipt, preventing false cron attestations.
- src/index.ts: private dashboard and JSON status routes.
- test/live-desk.test.ts and test/access-authorization.test.ts: security, UI and evidence-boundary verification.
- Build workflow serialized and rebased for concurrent GitHub writes.

## Evidence
- GitHub CI run 41811438299: 19/19 tests PASS, TS and shell checks PASS.
- Build run 41811406096 PASS; dist/index.js blob SHA a247f2d4d3d9443f27fb0018d6779a99ad9bede8.
- Cloudflare upload SUCCESS: version 18414f13-9a69-4ab4-a238-c5ef583f7c57, verified by GET at 100% of traffic.
- Fresh Cloudflare API GET: cron 17 10 * * * UTC; ACCESS_ALLOWLIST, MISSION_STATE and TASK_LEDGER preserved; operator-only Access policy retained.
- No billing changes, service-token issuance, expanded public routes, PIN disclosure or newly activated agent connections.

## Limits
- Production cron execution and persisted result UNKNOWN until actual scheduled result is observed.
- Authenticated dashboard HTTP not independently observed by this connector due outbound egress to workers.dev; manual browser visit can verify UI.
- Google Drive Seymour-related documents were discovered but are not synced to the Worker. Real historical project recovery remains HOLD.
- Dashboard GET is read-only; manual probe button triggers deliberate synthetic checkpoint writes.