import "server-only";

import { TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  type CanonicalTaskState,
  isCanonicalTerminalState,
  toCanonicalTaskState
} from "@/lib/orchestration/task-state-machine";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export interface CompletionBarrierTaskReport {
  taskId: string;
  objective: string;
  required: boolean;
  state: CanonicalTaskState;
  hasOutput: boolean;
  waived: boolean;
  outputFileId: string | null;
}

export interface CompletionBarrierResult {
  ok: boolean;
  runId: string;
  blockingTaskIds: string[];
  report: CompletionBarrierTaskReport[];
}

export async function runCompletionBarrier(input: {
  orgId: string;
  runId: string;
}): Promise<CompletionBarrierResult> {
  const tasks = await prisma.task.findMany({
    where: {
      flowId: input.runId,
      flow: {
        orgId: input.orgId
      }
    },
    select: {
      id: true,
      prompt: true,
      status: true,
      isPausedForInput: true,
      executionTrace: true
    },
    orderBy: { createdAt: "asc" }
  });

  const reports: CompletionBarrierTaskReport[] = [];
  for (const task of tasks) {
    const trace = asRecord(task.executionTrace);
    const normalizedTask = asRecord(trace.normalizedTask);
    const traceState = typeof normalizedTask.state === "string" ? normalizedTask.state : null;
    const state = toCanonicalTaskState({
      taskStatus: task.status,
      isPausedForInput: task.isPausedForInput,
      traceState
    });
    const normalizedTaskId =
      typeof normalizedTask.task_id === "string" && normalizedTask.task_id.trim().length > 0
        ? normalizedTask.task_id.trim()
        : task.id;
    const outputFileId =
      typeof trace.outputFileId === "string"
        ? trace.outputFileId
        : typeof normalizedTask.outputFileId === "string"
          ? normalizedTask.outputFileId
          : null;
    const outputPayload =
      typeof trace.outputPayload === "object" && trace.outputPayload && !Array.isArray(trace.outputPayload)
        ? trace.outputPayload
        : typeof normalizedTask.outputPayload === "object" &&
            normalizedTask.outputPayload &&
            !Array.isArray(normalizedTask.outputPayload)
          ? normalizedTask.outputPayload
          : null;
    const hasOutput = Boolean(outputFileId || outputPayload);
    const waived = normalizedTask.waived === true || trace.waived === true;
    const required = normalizedTask.required !== false;
    reports.push({
      taskId: normalizedTaskId,
      objective:
        typeof normalizedTask.objective === "string" && normalizedTask.objective.trim().length > 0
          ? normalizedTask.objective
          : task.prompt,
      required,
      state,
      hasOutput,
      waived,
      outputFileId
    });
  }

  const blockingTaskIds = reports
    .filter(
      (item) =>
        item.required &&
        !item.waived &&
        ((!isCanonicalTerminalState(item.state) ||
          item.state === "FAILED" ||
          item.state === "TIMEOUT") ||
          (item.state === "COMPLETED" && !item.hasOutput))
    )
    .map((item) => item.taskId);

  return {
    ok: blockingTaskIds.length === 0,
    runId: input.runId,
    blockingTaskIds,
    report: reports
  };
}

export function toTaskStatusFromBarrierState(state: CanonicalTaskState) {
  if (state === "COMPLETED") return TaskStatus.COMPLETED;
  if (state === "FAILED") return TaskStatus.FAILED;
  if (state === "TIMEOUT") return TaskStatus.ABORTED;
  if (state === "BLOCKED") return TaskStatus.PAUSED;
  if (state === "RUNNING") return TaskStatus.RUNNING;
  return TaskStatus.QUEUED;
}
