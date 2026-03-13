import {
  buildCurrentRunStateContractPrompt,
  buildWorkerContractPrompt
} from "../../agent/prompts/orchestration-contracts.ts";

export function buildRolePrompt(input: {
  roleName: string;
  teamGoal: string;
  responsibilities: string[];
  orgName: string;
  managerName: string;
  collaborationStyle: string;
}) {
  const taskJson = {
    role: input.roleName,
    team_goal: input.teamGoal,
    responsibilities: input.responsibilities,
    org_name: input.orgName,
    manager_name: input.managerName,
    collaboration_style: input.collaborationStyle
  };

  const runStatePrompt = buildCurrentRunStateContractPrompt({
    runId: "{run_id}",
    currentTaskId: "{current_task_id}",
    completedTasksSummary: "{completed_tasks_summary}",
    failedTasksSummary: "{failed_tasks_summary}",
    decisionsLog: "{decisions_log}",
    toolCallsLog: "{tool_calls_log}"
  });

  const workerPrompt = buildWorkerContractPrompt({
    specialistRole: input.roleName,
    taskJson
  });

  return `${runStatePrompt}\n\n${workerPrompt}`;
}
