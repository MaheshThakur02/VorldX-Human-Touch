export type PersistedTaskState =
  | "PENDING"
  | "ASSIGNED"
  | "ACKED"
  | "RUNNING"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED"
  | "TIMEOUT";

export interface PersistedTaskInputRef {
  ref_type: "hub_file" | "inline";
  ref_id?: string;
  value?: unknown;
}

export interface PersistedTaskExpectedOutput {
  name: string;
  type: "json" | "text" | "file";
}

export interface PersistedTaskToolPlan {
  toolkit: string;
  action: string;
}

export interface PersistedTaskApprovalPolicy {
  required: boolean;
  policy_id: string;
}

export interface PersistedTaskRetryPolicy {
  max_attempts: number;
  backoff_sec: number;
}

export interface PersistedTaskSchema {
  task_id: string;
  run_id: string;
  owner_agent_id: string;
  objective: string;
  inputs: PersistedTaskInputRef[];
  expected_outputs: PersistedTaskExpectedOutput[];
  success_criteria: string[];
  tool_plan: PersistedTaskToolPlan[];
  approval_policy: PersistedTaskApprovalPolicy;
  retry_policy: PersistedTaskRetryPolicy;
  timeout_sec: number;
  priority: "high" | "normal" | "low";
  state: PersistedTaskState;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export interface PersistedToolReceipt {
  tool_call_id: string;
  provider_request_id: string;
  status: string;
  started_at: string;
  ended_at: string;
  normalized_output_hash: string;
}

export function validatePersistedTaskSchema(task: PersistedTaskSchema) {
  if (!task.task_id.startsWith("t_")) {
    throw new Error("task_id must start with t_.");
  }
  if (!task.run_id.startsWith("r_")) {
    throw new Error("run_id must start with r_.");
  }
  if (!task.owner_agent_id.trim()) {
    throw new Error("owner_agent_id is required.");
  }
  if (!task.objective.trim()) {
    throw new Error("objective is required.");
  }
  if (task.expected_outputs.length === 0) {
    throw new Error("expected_outputs must include at least one item.");
  }
  if (task.tool_plan.length === 0) {
    throw new Error("tool_plan must include at least one tool action.");
  }
  if (task.success_criteria.length === 0) {
    throw new Error("success_criteria must include at least one criterion.");
  }
  if (task.retry_policy.max_attempts < 1) {
    throw new Error("retry_policy.max_attempts must be >= 1.");
  }
  if (task.timeout_sec < 1) {
    throw new Error("timeout_sec must be >= 1.");
  }
}
