# SEYMOUR COMMUNICATIONS MAP v0.1 — WHO IS WHO
Status: DESIGN / source-grounded historical identity map, NOT connected bots.
Updated: 2026-11-04. Authority: Jason Wisdom.

## Command ownership
- Jason Wisdom: mission scope, final authority for production, publication, spending, credential access and protected records.
- Seymour / Orchestrator: internal task routing, progress tracking, retries, recovery under mission scope; **not a legal or government authority**.
- Auditor: accountability ledger, PASS/HOLD/FAIL evidence receipts.
- Historian: source history, provenance and replay.
- Engineer: code, CI tests, debugging and implementation.
- Colonel Jessup: handoff gates and cross-role coordination, not veto power over unrelated internal drafting.
- Sentinel: monitors safety/permissions, no special access by default.
- Julie Powers: federation and coordination where an actual interface exists.
- Recon: source exploration.
- Gambit Zero x402: payment-related research only; spending disabled by default.
- Press: drafts only; publication requires Jason.

## Legacy 27 seats — historical, not yet bound
01 Librarian; 02 Receipt Clerk; 03 Family Continuity; 04 Story Weaver; 05 Ops/Deploy; 06 Operator Mirror; 07–27 unnamed.
All reported VACANT at last recovered roster. There is NO evidence of binding a listed bot identity to any seat. No automatic assignment here.

## Historical identities, separate namespaces
Legacy Jaywisdom44: 35 records from JAYWISDOM44_FAMILY_REGISTRY_V0_1.json, including one 'New Bot' unbound. A second Grok Bot record in the 10-agent federation must NOT be merged merely by name.
Federation: Julie Powers, Sentinel, Auditor, Historian, Recon, Engineer, Press, Colonel Jessup, Gambit Zero x402 Bot, Grok Bot. Configuration existence historically reported, but no current authenticated communication endpoint verified here.

## Internal transport (planned, not live)
- Browser -> Seymour Worker: HTTPS gateway WITH real session authentication; public HTML must not embed service secrets.
- Seymour -> Cloudflare internal agents: Service Bindings / RPC with an allowlist of binding names; no arbitrary URLs.
- Seymour -> async processing: Queues; deterministic message IDs, idempotency keys, bounded retries and budgets.
- Seymour -> mission state: MissionState Durable Object; save / load / unfinished. It is not the same as an external Grok agent.
- Seymour -> Grok family: only an explicitly verified, authenticated adapter; none is configured today.
- All agents -> receipt ledger: evidence pointers and task outcomes, never fabricate a completed result from an acknowledgment.

## Message envelope
```json
{
  "schema": "SEYMOUR_MESSAGE_V1",
  "missionId": "mission-id",
  "messageId": "uuid",
  "idempotencyKey": "hash-of-operation",
  "from": "orchestrator",
  "to": "engineer",
  "action": "build|research|test|report",
  "scope": "public-data and internal draft only",
  "payloadRef": "internal pointer",
  "status": "QUEUED",
  "requiresHumanApproval": false,
  "evidenceRefs": []
}
```
No messages are sent merely by checking this file into Git. Authentication, service bindings, runtime tests and observed agent endpoint identities are still required.

## Gate policy
- Automatic: public research, internal draft/test/replay and bounded delegation explicitly covered by mission.
- Stop only the relevant operation: evidence missing, impossible dependency, conflicting records or task failure.
- Human gate: external publication, privileged credentials, payments, sensitive data, production deployment.
- Global CI failure does NOT automatically halt separate read-only historical research.
