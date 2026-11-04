# SEYMOUR SWARM ORCHESTRATOR v0.3 — Event-Driven Workflows

One request → thousands of logical tasks → distributed execution → one verifiable answer.

Isolated Cloudflare Worker backed by a durable task ledger (Durable Object + SQLite) and optional Workflows for long-running investigations.

## Architecture

- **Supreme Seymour — Orchestrator**: Breaks questions into independent investigations.
- Agents: Source, Audit, Math, Legal research, Replay, Receipt.
- **JSON Evidence Graph**: Deduplicate • Verify • Reconcile • Replay.
- Every task: ID, source provenance, dependency list, cost budget, PASS/FAIL/UNKNOWN outcome.
- Duplicate research reused. Failed tasks retry. Missing evidence stays UNKNOWN.
- Bounded batches. Spending capped at $0. Operations read-only by default.
- Humans retain publication and legal decision authority.
- **Workflows**: Durable multi-step monitoring for long-running investigations (waitForEvent, queue-completion notifications, timeout reconciliation).

## Fan-out Simulator (Expanded)

POST `/investigate` accepts optional:
- `logicalTaskCount` (default 73,000)
- `dryRun` (true = ledger only, no queue messages)
- `useWorkflow` (true = start InvestigationWorkflow for monitoring)

Returns simulator math:
- logicalTasks
- tasksPerBatch (270)
- requiredBatches
- estimatedQueueOps (≈ 3× messages)
- freeTierOpsRemainingEstimate
- workflowInstanceId (when useWorkflow=true)

## Event-driven completion (v0.3)

- Queue consumer settles tasks in the TaskLedger and emits a `tasks-settled` event to Workflow `inv-{requestId}` when ledger pending count reaches zero.
- Workflow uses `step.waitForEvent("wait-for-tasks-settled", {type:"tasks-settled", timeout:"10 minutes"})` rather than fixed sleeps; initial ledger check handles fast completions.
- Event is a **hint only**: workflow always reconciles durable ledger before claiming `COMPLETE`; timeout produces `PARTIAL` if pending remains.
- Simulated tasks settle as **UNKNOWN**, never fabricated PASS.
- Live (non-dryRun) calls are rejected if `logicalTaskCount > 3000`, leaving theoretical Queue headroom; shared account usage and retries remain unverified.
- Use `{"question":"test","logicalTaskCount":10,"useWorkflow":true}` for a small local integration run.
- Default 73,000-task simulation requires `dryRun:true`, and even dry-run ledger writes can be expensive: further optimize before large tests.
- No public event-injection endpoint is exposed. A future authenticated interface must validate identity and authorization.

GET `/simulator/status` returns defaults and free-tier notes.  
GET `/workflow/{instanceId}` returns Workflow status.

Conceptual batching, not guaranteed Cloudflare throughput. Execution must respect CPU, subrequest, storage, and queue limits. Use `dryRun: true` to test large graphs without burning ops. Workflow steps counted separately (free tier ~3,000/day).

## Cloudflare Free Tier Respect

| Resource              | Free allowance     |
|-----------------------|--------------------|
| Worker requests       | 100,000/day        |
| External subrequests  | 50 per invocation  |
| Queues operations     | 10,000/day         |
| Workflows steps       | 3,000/day          |
| Concurrent Workflows  | 100                |

Queued messages typically consume 3 operations each. Design uses conceptual batching (e.g. 270 tasks/batch) while respecting actual limits.

## Quick Start

```bash
npm install
npx wrangler dev
# POST /investigate {"question": "Congressional investigation into X", "dryRun": true}
# POST /investigate {"question": "Congressional investigation into X", "useWorkflow": true}
# GET /graph/{requestId}
# GET /workflow/{instanceId}
# GET /simulator/status
```

Create the queue first if needed: `npx wrangler queues create seymour-tasks`

**No Cloudflare billing upgrade or deployment has been performed.**

## Design Principles

- Small number of Workers coordinating large numbers of independently tracked tasks.
- Not 100,000 separate deployed Workers.
- Task graph stored, deduplicated, executed in bounded batches, results recorded.
- Illustrative fan-out simulator expanded with batch math, dry-run, and Workflow support for long-running investigations.

Built for inverted swarm architecture. Verify > Narrative.

## v0.4 Mission Recovery (code-only; not deployed)

MissionState is a **new** SQLite-backed Durable Object (`MISSION_STATE`, migration `v2`). A single registry instance named `seymour-mission-registry-v1` stores checkpoint rows and indexes unfinished missions. No global listing across per-mission DO instances is needed.

- `POST /recovery/save`: persist `{missionId,status,lastStep,payload,note,timestamp}` (server records timestamp); returns revision.
- `GET /recovery/load/{missionId}`: read the last checkpoint.
- `GET /recovery/unfinished`: most recent 100 records in STARTED, IN_PROGRESS, HOLD, or FAILED, with summary only.
- `DELIVERED` is excluded from unfinished, but does **not** imply independent verification.
- `POST /bus/state` remains a stub and is not a substitute for the recovery API.
- Private recovery endpoints require `Authorization: Bearer <CONTROL_DESK_TOKEN>`. If the secret is absent they fail closed with 401. Do not put this secret into a public HTML page. Set up secure authentication and authorization before connecting browsers or real bots.
- The existing `/control-desk` intake is still a demo and is **not authenticated**; it does not persist or authorize production execution. Existing investigation/bus endpoints require a separate threat review before publication.

### Local verification (not yet executed)

1. Run `npm install` and `npx wrangler dev` with a **local-only** `CONTROL_DESK_TOKEN`.
2. POST a small STARTED checkpoint with the Authorization header; assert `saved:true`, revision 1.
3. GET the mission; assert exact payload and timestamp. Save again as IN_PROGRESS; assert revision 2.
4. GET unfinished; assert mission appears. Save DELIVERED; assert mission disappears from unfinished.
5. Restart Wrangler (preserving local storage), load the mission again, and assert the checkpoint persisted.
6. With no/incorrect token, assert HTTP 401 for all recovery paths.
7. Test invalid ID, status, oversized payload, unknown mission, and concurrent updates.
8. Only after these tests PASS, proceed with a dedicated authenticated UI adapter. **No deploy, payment, or Grok connection is authorized by these commits.**

