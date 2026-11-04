import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { TaskLedger } from "./task-ledger";

export interface InvestigationParams {
  requestId: string;
  question: string;
  logicalTaskCount?: number;
}

type TasksSettledEvent = { requestId: string; source: "task-queue"; kind: "tasks-settled" };

export class InvestigationWorkflow extends WorkflowEntrypoint<Env, InvestigationParams> {
  async run(event: WorkflowEvent<InvestigationParams>, step: WorkflowStep) {
    const { requestId, question } = event.payload;
    const stub = this.env.TASK_LEDGER.getByName(requestId);
    await step.do("record-start", async () => ({
      requestId, question, startedAt: Date.now(),
      note: "No conclusions are authorized by Workflow execution."
    }));

    // Reconcile before waiting: a Queue consumer may have finished before
    // the Workflow reaches waitForEvent. This also handles zero-task graphs.
    const initial = await step.do("initial-progress", () => stub.getProgressSummary(requestId));
    let signal: "already-settled" | "tasks-settled" | "timeout" = "already-settled";
    if (initial.total > 0 && initial.pending > 0) {
      try {
        const notification = await step.waitForEvent<TasksSettledEvent>(
          "wait-for-tasks-settled",
          { type: "tasks-settled", timeout: "10 minutes" }
        );
        // A notification is a hint, NOT evidence of completion.
        if (notification.payload?.requestId !== requestId ||
            notification.payload?.source !== "task-queue" ||
            notification.payload?.kind !== "tasks-settled") {
          signal = "timeout";
        } else {
          signal = "tasks-settled";
        }
      } catch {
        // On timeout or delivery error, reconcile ledger rather than
        // claiming completion. Do not use a fixed polling sleep.
        signal = "timeout";
      }
    }

    return step.do("final-reconciliation", async () => {
      const finalStats = await stub.getProgressSummary(requestId);
      return {
        requestId, question, finalStats, signal,
        completedAt: Date.now(),
        status: finalStats.total > 0 && finalStats.pending === 0 ? "COMPLETE" : "PARTIAL",
        note: "COMPLETE means tasks settled, not claims verified. Simulated outcomes are not factual PASS. Human review required."
      };
    });
  }
}
