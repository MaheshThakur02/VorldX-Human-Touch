import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { MemoryTier, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  type CanonicalTaskState,
  isCanonicalTerminalState
} from "@/lib/orchestration/task-state-machine";

export type OrchestrationEventType =
  | "TASK_ASSIGNED"
  | "TASK_ACKED"
  | "TASK_STARTED"
  | "TOOL_CALL_STARTED"
  | "TOOL_CALL_FINISHED"
  | "TASK_BLOCKED"
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_TIMEOUT";

export interface OrchestrationEventEnvelope {
  run_id: string;
  task_id: string;
  attempt: number;
  agent_id: string;
  event_type: OrchestrationEventType;
  timestamp: string;
  idempotency_key: string;
  payload_hash: string;
  payload: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function hashPayload(payload: Record<string, unknown>) {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function eventMemoryKey(event: OrchestrationEventEnvelope) {
  return [
    "orchestration.event",
    event.run_id,
    event.timestamp,
    event.event_type,
    event.idempotency_key
  ].join(".");
}

function eventIdemMemoryKey(orgId: string, idempotencyKey: string) {
  return `orchestration.event.idem.${orgId}.${idempotencyKey}`;
}

export function buildEventIdempotencyKey(input: {
  runId: string;
  taskId: string;
  attempt: number;
  eventType: OrchestrationEventType;
  hint?: string;
}) {
  const normalizedHint = input.hint?.trim() ?? "";
  return createHash("sha256")
    .update(
      `${input.runId}|${input.taskId}|${input.attempt}|${input.eventType}|${normalizedHint}`
    )
    .digest("hex");
}

export async function emitOrchestrationEvent(input: {
  orgId: string;
  runId: string;
  taskId: string;
  attempt: number;
  agentId: string;
  eventType: OrchestrationEventType;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const payload = input.payload ?? {};
  const idempotencyKey =
    input.idempotencyKey ??
    buildEventIdempotencyKey({
      runId: input.runId,
      taskId: input.taskId,
      attempt: input.attempt,
      eventType: input.eventType
    });
  const idemKey = eventIdemMemoryKey(input.orgId, idempotencyKey);
  const existing = await db.memoryEntry.findFirst({
    where: {
      orgId: input.orgId,
      tier: MemoryTier.WORKING,
      key: idemKey,
      redactedAt: null
    },
    select: { id: true }
  });
  if (existing) {
    return {
      inserted: false,
      idempotencyKey
    };
  }

  const envelope: OrchestrationEventEnvelope = {
    run_id: input.runId,
    task_id: input.taskId,
    attempt: Math.max(1, Math.floor(input.attempt)),
    agent_id: input.agentId || "unknown-agent",
    event_type: input.eventType,
    timestamp: new Date().toISOString(),
    idempotency_key: idempotencyKey,
    payload_hash: hashPayload(payload),
    payload
  };

  await db.memoryEntry.createMany({
    data: [
      {
        orgId: input.orgId,
        flowId: input.runId,
        taskId: null,
        tier: MemoryTier.WORKING,
        key: idemKey,
        value: { idempotencyKey } as Prisma.InputJsonValue
      },
      {
        orgId: input.orgId,
        flowId: input.runId,
        taskId: null,
        tier: MemoryTier.WORKING,
        key: eventMemoryKey(envelope),
        value: envelope as unknown as Prisma.InputJsonValue
      }
    ]
  });

  return {
    inserted: true,
    idempotencyKey
  };
}

export interface ProjectedTaskState {
  taskId: string;
  attempt: number;
  agentId: string;
  lastEventType: OrchestrationEventType;
  state: CanonicalTaskState | "UNKNOWN";
  timestamp: string;
}

function stateFromEventType(eventType: OrchestrationEventType): CanonicalTaskState | "UNKNOWN" {
  if (eventType === "TASK_ASSIGNED") return "ASSIGNED";
  if (eventType === "TASK_ACKED") return "ACKED";
  if (eventType === "TASK_STARTED") return "RUNNING";
  if (eventType === "TASK_BLOCKED") return "BLOCKED";
  if (eventType === "TASK_COMPLETED") return "COMPLETED";
  if (eventType === "TASK_FAILED") return "FAILED";
  if (eventType === "TASK_TIMEOUT") return "TIMEOUT";
  return "UNKNOWN";
}

export async function listOrchestrationEventsForRun(input: {
  orgId: string;
  runId: string;
  limit?: number;
}) {
  const rows = await prisma.memoryEntry.findMany({
    where: {
      orgId: input.orgId,
      flowId: input.runId,
      tier: MemoryTier.WORKING,
      key: {
        startsWith: `orchestration.event.${input.runId}.`
      },
      redactedAt: null
    },
    orderBy: {
      createdAt: "asc"
    },
    take: Math.max(1, Math.min(5000, input.limit ?? 2000))
  });

  return rows
    .map((row) => {
      const value = asRecord(row.value);
      return {
        run_id: typeof value.run_id === "string" ? value.run_id : "",
        task_id: typeof value.task_id === "string" ? value.task_id : "",
      attempt:
        typeof value.attempt === "number" && Number.isFinite(value.attempt)
          ? Math.max(1, Math.floor(value.attempt))
          : 1,
      agent_id: typeof value.agent_id === "string" ? value.agent_id : "unknown-agent",
      event_type:
        typeof value.event_type === "string" ? (value.event_type as OrchestrationEventType) : null,
      timestamp: typeof value.timestamp === "string" ? value.timestamp : row.createdAt.toISOString(),
      idempotency_key:
        typeof value.idempotency_key === "string"
          ? value.idempotency_key
          : randomUUID().replace(/-/g, ""),
      payload_hash: typeof value.payload_hash === "string" ? value.payload_hash : "",
      payload: asRecord(value.payload)
      };
    })
    .filter((item) => item.run_id && item.task_id && item.event_type);
}

export async function projectRunTaskStates(input: { orgId: string; runId: string }) {
  const events = await listOrchestrationEventsForRun(input);
  const projected = new Map<string, ProjectedTaskState>();

  for (const event of events) {
    const current = projected.get(event.task_id);
    if (!current || current.timestamp <= event.timestamp) {
      projected.set(event.task_id, {
        taskId: event.task_id,
        attempt: event.attempt,
        agentId: event.agent_id,
        lastEventType: event.event_type!,
        state: stateFromEventType(event.event_type!),
        timestamp: event.timestamp
      });
    }
  }

  return [...projected.values()];
}

export function summarizeRunTerminality(projected: ProjectedTaskState[]) {
  const terminal = projected.filter(
    (item) => item.state !== "UNKNOWN" && isCanonicalTerminalState(item.state)
  ).length;
  return {
    total: projected.length,
    terminal,
    pending: Math.max(0, projected.length - terminal)
  };
}
