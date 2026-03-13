import type { SwarmOrganizationState } from "../state.ts";

function summarizeRoleList(state: SwarmOrganizationState) {
  const lines = state.createdAgents.map((agent) => {
    const responsibility = agent.responsibilities[0] ?? "Contribute to team mission.";
    return `- ${agent.role}: ${responsibility}`;
  });
  return lines.join("\n");
}

export function summarizeTeamStatusNode(state: SwarmOrganizationState): SwarmOrganizationState {
  const barrierWarning = state.warnings.find((item) =>
    item.startsWith("runCompletionBarrier waiting for terminal tasks:")
  );
  if (barrierWarning) {
    return {
      ...state,
      finalUserResponse: [
        "Execution is still in progress.",
        barrierWarning,
        "Final aggregated response will be published after all required tasks reach terminal state."
      ].join(" ")
    };
  }

  const createdCount = state.squadWriteResults.filter((item) => item.status === "created").length;
  const reusedCount = state.squadWriteResults.filter((item) => item.status === "reused").length;
  const approvalsNeeded = state.approvalRequests.length;
  const teamType = state.teamBlueprint?.teamType ?? "general";
  const goal = state.teamBlueprint?.mission ?? state.swarmGoal;
  const hubState = state.hubContext
    ? state.hubContext.existed
      ? `reused (${state.hubContext.workspaceId})`
      : `initialized (${state.hubContext.workspaceId})`
    : "not initialized";

  const summary = [
    `Swarm manager update: ${teamType} team ${createdCount > 0 ? "created" : "prepared"} for your request.`,
    `Members added: ${createdCount}. Reused: ${reusedCount}.`,
    "Role assignments:",
    summarizeRoleList(state),
    `Shared goal: ${goal}`,
    `Hub workspace: ${hubState}.`,
    `Approvals needed: ${approvalsNeeded}.`,
    "Suggested next steps:",
    "1. Confirm team mission scope.",
    "2. Approve pending high-sensitivity actions if any.",
    "3. Ask Swarm to run the first collaboration cycle deliverables."
  ].join("\n");

  return {
    ...state,
    finalUserResponse: summary
  };
}
