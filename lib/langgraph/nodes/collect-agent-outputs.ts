import type { OrganizationGraphAdapters } from "../adapters/contracts.ts";
import type { SwarmOrganizationState } from "../state.ts";

export async function collectAgentOutputsNode(
  state: SwarmOrganizationState,
  adapters: OrganizationGraphAdapters
): Promise<SwarmOrganizationState> {
  const runId = state.durableRunId;
  if (!runId) {
    throw new Error("Cannot aggregate outputs without durable run id.");
  }
  if (!adapters.readDurableTaskSnapshots) {
    throw new Error("Adapter is missing readDurableTaskSnapshots implementation.");
  }
  if (!adapters.runCompletionBarrier) {
    throw new Error("Adapter is missing runCompletionBarrier implementation.");
  }

  const barrier = await adapters.runCompletionBarrier({
    orgId: state.orgId,
    runId
  });
  const snapshots = await adapters.readDurableTaskSnapshots({
    orgId: state.orgId,
    runId
  });
  if (!barrier.ok) {
    const blocking = new Set(barrier.blockingTaskIds);
    const waitingStates = new Set(["PENDING", "ASSIGNED", "ACKED", "RUNNING", "BLOCKED"]);
    const hasOnlyInFlightBlockers = snapshots
      .filter((item) => blocking.has(item.taskId))
      .every((item) => waitingStates.has(item.state));
    if (hasOnlyInFlightBlockers) {
      return {
        ...state,
        warnings: [
          ...state.warnings,
          `runCompletionBarrier waiting for terminal tasks: ${barrier.blockingTaskIds.join(", ")}`
        ],
        collaborationSummary: {
          completedTasks: snapshots.filter((item) => item.state === "COMPLETED").length,
          blockedTasks: snapshots.filter((item) => item.state === "BLOCKED").length,
          approvalsRequired: state.approvalRequests.length,
          toolCallsExecuted: snapshots.reduce((sum, item) => sum + item.toolReceipts.length, 0)
        }
      };
    }
    throw new Error(
      `runCompletionBarrier blocked finalization due non-terminal output integrity: ${barrier.blockingTaskIds.join(", ")}`
    );
  }

  const required = snapshots.filter((item) => !item.waived);
  const missingOutput = required.filter(
    (item) =>
      item.state === "COMPLETED" &&
      ((!item.output.outputFileId && !item.output.payload) || item.toolReceipts.length === 0)
  );
  if (missingOutput.length > 0) {
    throw new Error(
      `Required task outputs missing or incomplete: ${missingOutput.map((item) => item.taskId).join(", ")}`
    );
  }

  const aggregatedOutputs = required.map((item) => ({
    role: "DurableWorker",
    taskId: item.taskId,
    summary: `Task ${item.taskId} committed output.`,
    deliverable: JSON.stringify({
      task_id: item.taskId,
      output_file_id: item.output.outputFileId,
      output: item.output.payload,
      tool_receipts: item.toolReceipts
    }),
    usedToolRequestIds: item.toolReceipts.map((receipt) => receipt.tool_call_id)
  }));

  return {
    ...state,
    agentOutputs: aggregatedOutputs,
    collaborationSummary: {
      completedTasks: required.length,
      blockedTasks: snapshots.filter((item) => item.state === "BLOCKED").length,
      approvalsRequired: state.approvalRequests.length,
      toolCallsExecuted: required.reduce((sum, item) => sum + item.toolReceipts.length, 0)
    }
  };
}
