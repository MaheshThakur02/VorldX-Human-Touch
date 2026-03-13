import "server-only";

import { MemoryTier, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { emitOrchestrationEvent } from "@/lib/orchestration/event-log";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function heartbeatKey(runId: string, taskId: string) {
  return `orchestration.heartbeat.${runId}.${taskId}`;
}

export async function touchTaskHeartbeat(input: {
  orgId: string;
  runId: string;
  taskId: string;
  agentId?: string;
  attempt?: number;
}) {
  const key = heartbeatKey(input.runId, input.taskId);
  const existing = await prisma.memoryEntry.findFirst({
    where: {
      orgId: input.orgId,
      flowId: input.runId,
      taskId: input.taskId,
      tier: MemoryTier.WORKING,
      key,
      redactedAt: null
    },
    select: {
      id: true
    }
  });
  const value = {
    touchedAt: new Date().toISOString(),
    agentId: input.agentId ?? null
  };
  if (existing) {
    await prisma.memoryEntry.update({
      where: { id: existing.id },
      data: {
        value
      }
    });
  } else {
    await prisma.memoryEntry.create({
      data: {
        orgId: input.orgId,
        flowId: input.runId,
        taskId: input.taskId,
        tier: MemoryTier.WORKING,
        key,
        value
      }
    });
  }
}

export interface TaskTimeoutWatchdogResult {
  scanned: number;
  timedOut: string[];
}

export async function runTaskTimeoutWatchdog(input: {
  orgId: string;
  now?: Date;
}): Promise<TaskTimeoutWatchdogResult> {
  const now = input.now ?? new Date();
  const running = await prisma.task.findMany({
    where: {
      flow: {
        orgId: input.orgId
      },
      status: TaskStatus.RUNNING
    },
    select: {
      id: true,
      flowId: true,
      agentId: true,
      executionTrace: true,
      updatedAt: true
    }
  });

  const timedOut: string[] = [];
  for (const task of running) {
    const trace = asRecord(task.executionTrace);
    const normalizedTask = asRecord(trace.normalizedTask);
    const timeoutSecRaw =
      typeof normalizedTask.timeout_sec === "number"
        ? normalizedTask.timeout_sec
        : typeof normalizedTask.timeoutSec === "number"
          ? normalizedTask.timeoutSec
          : 600;
    const timeoutSec = Math.max(30, Math.min(86_400, Math.floor(timeoutSecRaw)));
    const attemptsRaw =
      typeof normalizedTask.attempts === "number" && Number.isFinite(normalizedTask.attempts)
        ? normalizedTask.attempts
        : 1;
    const attempts = Math.max(1, Math.floor(attemptsRaw));
    const retryPolicy = asRecord(normalizedTask.retry_policy);
    const maxAttemptsRaw =
      typeof retryPolicy.max_attempts === "number" && Number.isFinite(retryPolicy.max_attempts)
        ? retryPolicy.max_attempts
        : 1;
    const maxAttempts = Math.max(1, Math.floor(maxAttemptsRaw));
    const canRetry = attempts < maxAttempts;
    const heartbeat = await prisma.memoryEntry.findFirst({
      where: {
        orgId: input.orgId,
        flowId: task.flowId,
        taskId: typeof normalizedTask.task_id === "string" ? normalizedTask.task_id : task.id,
        tier: MemoryTier.WORKING,
        key: heartbeatKey(
          task.flowId,
          typeof normalizedTask.task_id === "string" ? normalizedTask.task_id : task.id
        ),
        redactedAt: null
      },
      orderBy: { updatedAt: "desc" },
      select: {
        updatedAt: true
      }
    });
    const lastBeatAt = heartbeat?.updatedAt ?? task.updatedAt;
    const elapsedMs = now.getTime() - lastBeatAt.getTime();
    if (elapsedMs <= timeoutSec * 1000) {
      continue;
    }

    await prisma.task.update({
      where: {
        id: task.id
      },
      data: {
        status: canRetry ? TaskStatus.QUEUED : TaskStatus.ABORTED,
        isPausedForInput: false,
        humanInterventionReason: canRetry
          ? `Timeout watchdog exceeded ${timeoutSec}s without heartbeat; retry queued.`
          : `Timeout watchdog exceeded ${timeoutSec}s without heartbeat.`,
        executionTrace: {
          ...trace,
          normalizedTask: {
            ...normalizedTask,
            state: canRetry ? "PENDING" : "TIMEOUT",
            attempts: canRetry ? attempts + 1 : attempts,
            updated_at: now.toISOString()
          }
        }
      }
    });
    await emitOrchestrationEvent({
      orgId: input.orgId,
      runId: task.flowId,
      taskId: typeof normalizedTask.task_id === "string" ? normalizedTask.task_id : task.id,
      attempt: 1,
      agentId: task.agentId ?? "unassigned-agent",
      eventType: "TASK_TIMEOUT",
      idempotencyKey: `${task.flowId}:${task.id}:timeout`,
      payload: {
        timeoutSec,
        canRetry
      }
    });
    if (!canRetry) {
      await prisma.memoryEntry.create({
        data: {
          orgId: input.orgId,
          flowId: task.flowId,
          taskId: task.id,
          tier: MemoryTier.WORKING,
          key: `orchestration.dead-letter.${task.flowId}.${task.id}`,
          value: {
            reason: "TASK_TIMEOUT_MAX_ATTEMPTS_EXCEEDED",
            timeoutSec,
            attempts,
            maxAttempts,
            markedAt: now.toISOString()
          }
        }
      });
    }
    timedOut.push(task.id);
  }

  return {
    scanned: running.length,
    timedOut
  };
}
