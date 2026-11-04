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
