import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { TaskLedger } from "./task-ledger";

export interface InvestigationParams {
  requestId: string;
  question: string;
  logicalTaskCount?: number;
}

export class InvestigationWorkflow extends WorkflowEntrypoint<Env, InvestigationParams> {
  async run(event: WorkflowEvent<InvestigationParams>, step: WorkflowStep) {
    const { requestId, question } = event.payload;
    const stub = this.env.TASK_LEDGER.getByName(requestId);

    // Step 1: Confirm ledger exists and record start
    const startStatus = await step.do("record-start", async () => {
      // In a real system this would create the initial task graph if not already present
      return {
        requestId,
        question,
        startedAt: Date.now(),
        note: "Workflow started. Tasks expected to be pre-created by orchestrator or created here in future versions.",
      };
    });

    // Step 2: Wait for initial batch processing (bounded sleep)
    await step.sleep("wait-for-initial-batches", "30 seconds");

    // Step 3: Check evidence graph progress
    const progress = await step.do("check-progress", async () => {
      const graph = await stub.getEvidenceGraph(requestId);
      return {
        total: graph.stats.total,
        pass: graph.stats.pass,
        unknown: graph.stats.unknown,
        pending: graph.stats.pending,
        checkedAt: Date.now(),
      };
    });

    // Step 4: Optional second wait if still pending (illustrative)
    if (progress.pending > 0) {
      await step.sleep("wait-for-more-batches", "60 seconds");
    }

    // Step 5: Final reconciliation snapshot
    const final = await step.do("final-reconciliation", async () => {
      const graph = await stub.getEvidenceGraph(requestId);
      return {
        requestId,
        question,
        finalStats: graph.stats,
        completedAt: Date.now(),
        status: graph.stats.pending === 0 ? "COMPLETE" : "PARTIAL",
        note: "Humans retain publication and legal decision authority. Missing evidence remains UNKNOWN.",
      };
    });

    return final;
  }
}
