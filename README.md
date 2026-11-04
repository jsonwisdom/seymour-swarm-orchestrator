# SEYMOUR SWARM ORCHESTRATOR v0.2

One request → thousands of logical tasks → distributed execution → one verifiable answer.

Isolated Cloudflare Worker backed by a durable task ledger (Durable Object + SQLite).

## Architecture

- **Supreme Seymour — Orchestrator**: Breaks questions into independent investigations.
- Agents: Source, Audit, Math, Legal research, Replay, Receipt.
- **JSON Evidence Graph**: Deduplicate • Verify • Reconcile • Replay.
- Every task: ID, source provenance, dependency list, cost budget, PASS/FAIL/UNKNOWN outcome.
- Duplicate research reused. Failed tasks retry. Missing evidence stays UNKNOWN.
- Bounded batches. Spending capped at $0. Operations read-only by default.
- Humans retain publication and legal decision authority.

## Fan-out Simulator (Expanded)

POST `/investigate` accepts optional:
- `logicalTaskCount` (default 73,000)
- `dryRun` (true = ledger only, no queue messages)

Returns simulator math:
- logicalTasks
- tasksPerBatch (270)
- requiredBatches
- estimatedQueueOps (≈ 3× messages)
- freeTierOpsRemainingEstimate

GET `/simulator/status` returns defaults and free-tier notes.

Conceptual batching, not guaranteed Cloudflare throughput. Execution must respect CPU, subrequest, storage, and queue limits. Use `dryRun: true` to test large graphs without burning ops.

## Cloudflare Free Tier Respect

| Resource              | Free allowance     |
|-----------------------|--------------------|
| Worker requests       | 100,000/day        |
| External subrequests  | 50 per invocation  |
| Queues operations     | 10,000/day         |
| Workflows steps       | 3,000/day          |

Queued messages typically consume 3 operations each. Design uses conceptual batching (e.g. 270 tasks/batch) while respecting actual limits.

## Quick Start

```bash
npm install
npx wrangler dev
# POST /investigate {"question": "Congressional investigation into X", "dryRun": true}
# GET /graph/{requestId}
# GET /simulator/status
```

Create the queue first if needed: `npx wrangler queues create seymour-tasks`

**No Cloudflare billing upgrade or deployment has been performed.**

## Design Principles

- Small number of Workers coordinating large numbers of independently tracked tasks.
- Not 100,000 separate deployed Workers.
- Task graph stored, deduplicated, executed in bounded batches, results recorded.
- Illustrative fan-out simulator expanded with batch math and dry-run support.

Built for inverted swarm architecture. Verify > Narrative.
