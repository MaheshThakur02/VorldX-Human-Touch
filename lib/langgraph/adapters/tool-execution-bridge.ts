import { createHash, randomUUID } from "node:crypto";

import type { PersistedToolReceipt } from "@/lib/orchestration/task-schema";

export interface ExistingToolExecutionInput {
  orgId: string;
  userId: string;
  toolkit: string;
  action: string;
  arguments?: Record<string, unknown>;
  taskId?: string;
}

export type ExistingToolExecutionResult =
  | {
      ok: true;
      toolkit: string;
      action: string;
      toolSlug: string;
      data: Record<string, unknown>;
      logId: string | null;
      attempts: number;
      receipts?: PersistedToolReceipt[];
    }
  | {
      ok: false;
      attempts: number;
      error: {
        code: string;
        message: string;
        toolkit: string;
        action: string;
        connectUrl?: string;
        retryable?: boolean;
      };
    };

export interface ExecuteThroughExistingToolPathDependencies {
  executeFn: (input: ExistingToolExecutionInput) => Promise<ExistingToolExecutionResult>;
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

function buildExecutionReceipt(input: {
  toolkit: string;
  action: string;
  taskId?: string;
  data: Record<string, unknown>;
}): PersistedToolReceipt {
  const startedAt = new Date().toISOString();
  const endedAt = new Date().toISOString();
  const tool_call_id = `tool_${createHash("sha1")
    .update(`${input.taskId ?? "na"}|${input.toolkit}|${input.action}`)
    .digest("hex")
    .slice(0, 24)}`;
  const normalized_output_hash = createHash("sha256")
    .update(stableStringify(input.data))
    .digest("hex");
  return {
    tool_call_id,
    provider_request_id: `provider_${randomUUID().slice(0, 12)}`,
    status: "success",
    started_at: startedAt,
    ended_at: endedAt,
    normalized_output_hash
  };
}

export async function executeThroughExistingToolPath(
  input: ExistingToolExecutionInput,
  dependencies: ExecuteThroughExistingToolPathDependencies
) {
  const executeFn = dependencies.executeFn;
  const result = await executeFn(input);
  if (!result.ok) {
    return result;
  }

  const receipts =
    result.receipts && result.receipts.length > 0
      ? result.receipts
      : [
          buildExecutionReceipt({
            toolkit: result.toolkit,
            action: result.action,
            taskId: input.taskId,
            data: result.data
          })
        ];

  return {
    ...result,
    receipts
  };
}
