import { TaskStatus } from "@prisma/client";

export type CanonicalTaskState =
  | "PENDING"
  | "ASSIGNED"
  | "ACKED"
  | "RUNNING"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED"
  | "TIMEOUT";

const ALLOWED_TRANSITIONS: Record<CanonicalTaskState, CanonicalTaskState[]> = {
  PENDING: ["ASSIGNED", "BLOCKED", "FAILED", "TIMEOUT"],
  ASSIGNED: ["ACKED", "BLOCKED", "FAILED", "TIMEOUT"],
  ACKED: ["RUNNING", "BLOCKED", "FAILED", "TIMEOUT"],
  RUNNING: ["BLOCKED", "COMPLETED", "FAILED", "TIMEOUT"],
  BLOCKED: ["ASSIGNED", "FAILED", "TIMEOUT"],
  COMPLETED: [],
  FAILED: [],
  TIMEOUT: []
};

export function isCanonicalTerminalState(state: CanonicalTaskState) {
  return state === "COMPLETED" || state === "FAILED" || state === "TIMEOUT";
}

export function canTransitionTaskState(from: CanonicalTaskState, to: CanonicalTaskState) {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTaskStateTransition(from: CanonicalTaskState, to: CanonicalTaskState) {
  if (!canTransitionTaskState(from, to)) {
    throw new Error(`Invalid task state transition: ${from} -> ${to}`);
  }
}

export function toCanonicalTaskState(input: {
  taskStatus: TaskStatus;
  isPausedForInput: boolean;
  traceState?: unknown;
}): CanonicalTaskState {
  const traceState =
    typeof input.traceState === "string" ? input.traceState.trim().toUpperCase() : "";
  if (traceState === "PENDING") return "PENDING";
  if (traceState === "ASSIGNED") return "ASSIGNED";
  if (traceState === "ACKED") return "ACKED";
  if (traceState === "RUNNING") return "RUNNING";
  if (traceState === "BLOCKED") return "BLOCKED";
  if (traceState === "COMPLETED") return "COMPLETED";
  if (traceState === "FAILED") return "FAILED";
  if (traceState === "TIMEOUT") return "TIMEOUT";

  if (input.taskStatus === TaskStatus.COMPLETED) return "COMPLETED";
  if (input.taskStatus === TaskStatus.FAILED || input.taskStatus === TaskStatus.ABORTED) {
    return "FAILED";
  }
  if (input.taskStatus === TaskStatus.PAUSED || input.isPausedForInput) return "BLOCKED";
  if (input.taskStatus === TaskStatus.RUNNING) return "RUNNING";
  return "PENDING";
}

export function toTaskStatusFromCanonical(state: CanonicalTaskState): TaskStatus {
  if (state === "COMPLETED") return TaskStatus.COMPLETED;
  if (state === "FAILED") return TaskStatus.FAILED;
  if (state === "TIMEOUT") return TaskStatus.ABORTED;
  if (state === "BLOCKED") return TaskStatus.PAUSED;
  if (state === "RUNNING") return TaskStatus.RUNNING;
  return TaskStatus.QUEUED;
}
