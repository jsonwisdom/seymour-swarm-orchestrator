# Seymour Access Worker deployment receipt — 2026-11-04

## Configuration and source
- Cloudflare Zero Trust org enabled: Seymour Zero Trust, auth domain aged-waterfall-ae77.cloudflareaccess.com.
- Access app id: 202be64b-7510-47da-b2ce-06e4d390b0da; operator-only email allow policy; public overrides /health, /comms/who, /simulator/status.
- Cloudflare secret ACCESS_ALLOWLIST configured; no CONTROL_DESK_TOKEN or ACCESS_ORCHESTRATION_ALLOWLIST.
- New Worker module built from GitHub dist/index.js (blob SHA 4c1da61ada906500fc150a32c2c9b1d777090a22), containing ctx.access.getIdentity() and separately scoped permissions.
- Latest relevant GitHub CI tests: 41802225036 typecheck + 12/12 tests PASS; bundle 41802224924 PASS. Subsequent shell check CI 41803608515 PASS.

## Deployment record
- A first PUT attempt failed HTTP 400 code 10074 because duplicate new-sqlite-class migration was sent for TaskLedger. This failed attempt did not replace the Worker.
- Second PUT reused existing Durable Object bindings, strictly inherited ACCESS_ALLOWLIST, and omitted duplicate migration. Returned success.
- Fresh Cloudflare GET deployments: version 0403d07d-978f-49a7-90fe-12c831215fb6 at 100% of traffic, created 2026-11-04T09:09:49.845583Z.
- Fresh GET settings: ACCESS_ALLOWLIST secret_text, MISSION_STATE -> MissionState, TASK_LEDGER -> TaskLedger; compatible 2026-11-04.
- GET /secrets: ACCESS_ALLOWLIST only. No tokens revealed.
- No billing-plan modification or external bot connection completed.

## Acceptance gates
- PASS: Access organization/app/policy created; worker code uploaded; deployed version and bindings checked via Cloudflare API.
- REPORTED PASS from separate external client: GET /health 200, GET /comms/who 200, unauthenticated /recovery/unfinished 302 Access challenge after Access activation. These were before updated code deployment and should be rechecked.
- HOLD: signed-in Access ctx.access.getIdentity() allowlist proof; authenticated POST /recovery/save and GET /recovery/load revision 1/2; fresh-session persistence; external Grok connections; internal Queue/Workflow bindings.
- Never record PASS for authenticated persistence without observed live requests. Never ask user to paste OTP, Access cookies, or bearer tokens in chat.
