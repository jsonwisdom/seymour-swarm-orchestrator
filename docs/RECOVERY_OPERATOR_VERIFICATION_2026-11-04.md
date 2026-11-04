# Seymour protected operator recovery verifier — live deployment receipt

Date: 2026-11-04 (UTC)

## Implemented

- Source: `src/recovery-operator.ts`, `src/index.ts`.
- Protected entry: `https://seymour-swarm-orchestrator.jaywisdom44.workers.dev/recovery/operator`
- Protected assets: `/recovery/operator.js` and `/recovery/operator.css`.
- Only a Cloudflare-verified Access identity allowlisted under `ACCESS_ALLOWLIST` may access these routes. They do not grant orchestration scope.
- HTML uses a restrictive Content Security Policy, same-origin script/CSS and network calls, no third-party services or credentials, and synthetic non-sensitive probe payloads.
- On authenticated click, browser calls existing `POST /recovery/save` (STARTED), `GET /recovery/load/{id}` revision 1, `POST /recovery/save` (IN_PROGRESS), `GET /recovery/load/{id}` revision 2, then `GET /recovery/unfinished`.
- First-stage success is labeled `AUTHENTICATED_ROUNDTRIP_PASS` only if every check returns correct values; otherwise it displays `FAIL`. It provides a link for readback in a separate private browser session.
- Fresh-session click confirms the exact mission, status, revision and synthetic probe marker. It labels `FRESH_READ_PASS`, with `separateBrowserSession: USER_MUST_CONFIRM`, not an independently established fresh-session attestation.
- No one-time PIN, session cookie, Access JWT or service-token secret is requested, logged, or transmitted outside the same-origin authenticated browser requests.

## Verified automated evidence

- GitHub CI recovery/security tests `41806487187`: **14/14 PASS**; TypeScript typecheck and shell syntax PASS.
- GitHub Worker bundle build `41806231175`: **PASS**, build source includes operator console.
- Cloudflare PUT upload succeeded without repeating Durable Object migrations. Live GET deployments confirms version `a0904ca5-187d-4ea8-b38a-c1a638891ee8` with 100% traffic, timestamp 2026-11-04T09:21:13.617363Z.
- Live GET settings verifies `ACCESS_ALLOWLIST` (secret_text), `MISSION_STATE -> MissionState`, `TASK_LEDGER -> TaskLedger`. Access application remains **Seymour Control Desk** with human-operator-only allow policy.
- Cloudflare API connector can perform authenticated management calls but its general outbound `fetch` to this Worker is blocked with **403 from its own egress policy**, body `Forbidden: requests to seymour-swarm-orchestrator.jaywisdom44.workers.dev are not allowed`. This response contains no Cloudflare-Ray/server and **does not represent a Worker 403**.

## Acceptance boundary

- PASS: CI, module deployment, preserved bindings, Access app configured.
- HOLD: first actual allowlisted browser login, authenticated save/load and fresh-session read. A Cloudflare management API OAuth session is not interchangeable with Cloudflare Access login.
- Do not bypass Access, invent bearer credentials, change public policies or claim success based on an unauthenticated redirect.
- Next legitimate step: use the protected operator page with Cloudflare OTP. Only share the non-secret PASS/FAIL receipt and missionId, never PIN or cookie.
