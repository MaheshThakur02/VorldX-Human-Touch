import { createHash, randomUUID } from "node:crypto";

import type { OrganizationGraphAdapters } from "../adapters/contracts.ts";
import type { ApprovalRequest, SwarmOrganizationState } from "../state.ts";
import { normalizeToolOutputForHub } from "../utils/tool-output-normalizer.ts";
import type {
  PersistedTaskSchema,
  PersistedToolReceipt
} from "@/lib/orchestration/task-schema";

function toApprovalRequest(reason: string, metadata: Record<string, unknown>): ApprovalRequest {
  const idempotencyKey =
    typeof metadata.idempotencyKey === "string"
      ? metadata.idempotencyKey
      : `lg-approval-${randomUUID().slice(0, 8)}`;
  return {
    requestId: idempotencyKey,
    reason,
    status: "PENDING",
    checkpointId: null,
    metadata
  };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function toolRequestSignature(input: {
  toolkit: string;
  action: string;
  arguments: Record<string, unknown>;
}) {
  return `${input.toolkit.toLowerCase()}:${input.action.toUpperCase()}:${stableStringify(
    input.arguments
  )}`;
}

function approvalPolicyHash(input: Record<string, unknown>) {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function approvalIdempotencyKey(input: {
  runId: string;
  taskId: string;
  policyHash: string;
}) {
  return `${input.runId}:${input.taskId}:${input.policyHash}`;
}

function taskDispatchIdempotencyKey(input: { runId: string; taskId: string; attempt: number }) {
  return `${input.runId}:${input.taskId}:${input.attempt}`;
}

function toolCallIdempotencyKey(input: {
  runId: string;
  taskId: string;
  toolCallIndex: number;
  attempt: number;
}) {
  return `${input.runId}:${input.taskId}:${input.toolCallIndex}:${input.attempt}`;
}

function hubWriteIdempotencyKey(input: {
  runId: string;
  taskId: string;
  outputName: string;
}) {
  return `${input.runId}:${input.taskId}:${input.outputName}`;
}

function inferSideEffectType(action: string) {
  const normalized = action.trim().toUpperCase();
  if (/(SEND|EMAIL|MESSAGE|NOTIFY|POST|PUBLISH)/.test(normalized)) {
    return "COMMUNICATION_SEND" as const;
  }
  if (/(PAY|CHARGE|INVOICE|BILL|TRANSFER|REFUND)/.test(normalized)) {
    return "PAYMENT" as const;
  }
  if (/(CREATE|UPDATE|DELETE|WRITE|MODIFY|UPSERT)/.test(normalized)) {
    return "EXTERNAL_WRITE" as const;
  }
  return "NONE" as const;
}

function inferDataSensitivity(toolkit: string) {
  const normalized = toolkit.trim().toLowerCase();
  if (["stripe", "quickbooks"].includes(normalized)) {
    return "FINANCIAL" as const;
  }
  if (["gmail", "outlook", "salesforce", "hubspot"].includes(normalized)) {
    return "PII" as const;
  }
  if (normalized) {
    return "EXTERNAL" as const;
  }
  return "NONE" as const;
}

function normalizeTaskToPersistedSchema(task: SwarmOrganizationState["pendingTasks"][number]): PersistedTaskSchema {
  return {
    task_id: task.taskId,
    run_id: task.runId,
    owner_agent_id: task.ownerAgentId,
    objective: task.objective,
    inputs: task.inputs,
    expected_outputs: task.expectedOutputs,
    success_criteria: task.successCriteria,
    tool_plan: task.toolPlan,
    approval_policy: {
      required: task.approvalPolicy.required,
      policy_id: task.approvalPolicy.policyId
    },
    retry_policy: {
      max_attempts: task.retryPolicy.maxAttempts,
      backoff_sec: task.retryPolicy.backoffSec
    },
    timeout_sec: task.timeoutSec,
    priority: task.priority,
    state: task.state,
    attempts: task.attempts,
    created_at: task.createdAt,
    updated_at: task.updatedAt
  };
}

function defaultInternalReceipt(input: {
  taskId: string;
  action: string;
  output: Record<string, unknown>;
}): PersistedToolReceipt {
  const startedAt = new Date().toISOString();
  const endedAt = new Date().toISOString();
  return {
    tool_call_id: `internal-${input.taskId}-${input.action}`.slice(0, 120),
    provider_request_id: `internal-${randomUUID().slice(0, 12)}`,
    status: "success",
    started_at: startedAt,
    ended_at: endedAt,
    normalized_output_hash: createHash("sha256")
      .update(stableStringify(input.output))
      .digest("hex")
  };
}

export async function runCollaborationCycleNode(
  state: SwarmOrganizationState,
  adapters: OrganizationGraphAdapters
) {
  if (!state.teamBlueprint) {
    return state;
  }

  const pendingTasks = [...state.pendingTasks];
  const inProgressTasks = [] as typeof state.inProgressTasks;
  const blockedTasks = [] as typeof state.blockedTasks;
  const completedTasks = [] as typeof state.completedTasks;
  const approvalRequests = [...state.approvalRequests];
  const agentOutputs = [...state.agentOutputs];
  const warnings = [...state.warnings];
  const toolRequestCache = new Map<
    string,
    {
      sourceRequestId: string;
      summary: string;
      deliverable: string;
      receipts: PersistedToolReceipt[];
    }
  >();
  let toolCallsExecuted = 0;
  const defaultRunId = state.durableRunId ?? `r_${state.graphRunId.replace(/^lg-run-/, "")}`;
  let durableRunId = defaultRunId;
  const knownTaskIds = new Set(pendingTasks.map((task) => task.taskId));
  const hasAnyExplicitTaskBindings = state.toolRequests.some((request) =>
    knownTaskIds.has(request.taskId)
  );
  const unboundToolRequests = !hasAnyExplicitTaskBindings ? [...state.toolRequests] : [];

  if (adapters.ensureDurableRun) {
    const ensured = await adapters.ensureDurableRun({
      orgId: state.orgId,
      userId: state.userId,
      graphRunId: state.graphRunId,
      prompt: state.userRequest
    });
    durableRunId = ensured.runId || defaultRunId;
  }

  if (adapters.persistDurableTasks) {
    await adapters.persistDurableTasks({
      orgId: state.orgId,
      runId: durableRunId,
      tasks: pendingTasks.map(normalizeTaskToPersistedSchema)
    });
  }

  for (const task of pendingTasks) {
    const runId = durableRunId;
    const baseAttempt = Math.max(1, task.attempts + 1);
    const agentId = task.ownerAgentId || "unknown-agent";
    if (adapters.appendOrchestrationEvent) {
      await adapters.appendOrchestrationEvent({
        orgId: state.orgId,
        runId,
        taskId: task.taskId,
        attempt: baseAttempt,
        agentId,
        eventType: "TASK_ASSIGNED",
        idempotencyKey: taskDispatchIdempotencyKey({
          runId,
          taskId: task.taskId,
          attempt: baseAttempt
        }),
        payload: {
          objective: task.objective,
          priority: task.priority
        }
      });
    }
    if (adapters.markDurableTaskState) {
      await adapters.markDurableTaskState({
        orgId: state.orgId,
        runId,
        taskId: task.taskId,
        nextState: "ASSIGNED",
        attempts: baseAttempt
      });
      await adapters.markDurableTaskState({
        orgId: state.orgId,
        runId,
        taskId: task.taskId,
        nextState: "ACKED",
        attempts: baseAttempt
      });
    }
    if (adapters.appendOrchestrationEvent) {
      await adapters.appendOrchestrationEvent({
        orgId: state.orgId,
        runId,
        taskId: task.taskId,
        attempt: baseAttempt,
        agentId,
        eventType: "TASK_ACKED",
        payload: {
          ack: true,
          restated_objective: task.objective,
          detected_gaps: [],
          ready_to_execute: true
        }
      });
    }

    if (task.requiresApproval) {
      blockedTasks.push(task);
      if (adapters.markDurableTaskState) {
        await adapters.markDurableTaskState({
          orgId: state.orgId,
          runId,
          taskId: task.taskId,
          nextState: "BLOCKED",
          attempts: baseAttempt
        });
      }
      if (adapters.appendOrchestrationEvent) {
        await adapters.appendOrchestrationEvent({
          orgId: state.orgId,
          runId,
          taskId: task.taskId,
          attempt: baseAttempt,
          agentId,
          eventType: "TASK_BLOCKED",
          payload: {
            reason: "Approval required."
          }
        });
      }
      const policyHash = approvalPolicyHash({
        runId,
        taskId: task.taskId,
        policyId: task.approvalPolicy.policyId,
        reason: "task_assignment"
      });
      const idempotencyKey = approvalIdempotencyKey({
        runId,
        taskId: task.taskId,
        policyHash
      });
      approvalRequests.push(
        toApprovalRequest(`Approval required for task: ${task.title}`, {
          runId,
          taskId: task.taskId,
          role: task.role,
          source: "task_assignment",
          riskClass: "HIGH",
          dataSensitivity: "NONE",
          sideEffectType: "NONE",
          policyHash,
          idempotencyKey
        })
      );
      continue;
    }

    inProgressTasks.push(task);
    if (adapters.markDurableTaskState) {
      await adapters.markDurableTaskState({
        orgId: state.orgId,
        runId,
        taskId: task.taskId,
        nextState: "RUNNING",
        attempts: baseAttempt
      });
    }
    if (adapters.appendOrchestrationEvent) {
      await adapters.appendOrchestrationEvent({
        orgId: state.orgId,
        runId,
        taskId: task.taskId,
        attempt: baseAttempt,
        agentId,
        eventType: "TASK_STARTED",
        payload: {
          objective: task.objective
        }
      });
    }

    const linkedRequests = state.toolRequests.filter((request) => request.taskId === task.taskId);
    if (linkedRequests.length === 0 && unboundToolRequests.length > 0) {
      const next = unboundToolRequests.shift();
      if (next) {
        linkedRequests.push(next);
      }
    }
    const receipts: PersistedToolReceipt[] = [];
    const usedToolRequestIds: string[] = [];
    let composedDeliverable = `Task execution completed for "${task.title}".`;
    let blocked = false;

    if (linkedRequests.length === 0) {
      const syntheticOutput = {
        task_id: task.taskId,
        status: "completed",
        output: {
          objective: task.objective
        }
      };
      const receipt = defaultInternalReceipt({
        taskId: task.taskId,
        action: "GENERATE_OUTPUT",
        output: syntheticOutput
      });
      receipts.push(receipt);
      if (adapters.upsertToolReceipt) {
        await adapters.upsertToolReceipt({
          orgId: state.orgId,
          runId,
          taskId: task.taskId,
          receipt,
          idempotencyKey: toolCallIdempotencyKey({
            runId,
            taskId: task.taskId,
            toolCallIndex: 0,
            attempt: baseAttempt
          })
        });
      }
      composedDeliverable = JSON.stringify(syntheticOutput);
    }

    for (let requestIndex = 0; requestIndex < linkedRequests.length; requestIndex += 1) {
      const request = linkedRequests[requestIndex]!;
      if (request.requiresApproval) {
        const policyHash = approvalPolicyHash({
          runId,
          taskId: task.taskId,
          requestId: request.requestId,
          toolkit: request.toolkit,
          action: request.action,
          reason: request.reason || "tool_request"
        });
        const idempotencyKey = approvalIdempotencyKey({
          runId,
          taskId: task.taskId,
          policyHash
        });
        approvalRequests.push(
          toApprovalRequest(
            request.reason || `Approval required for ${request.toolkit}:${request.action}`,
            {
              runId,
              requestId: request.requestId,
              taskId: request.taskId,
              role: request.role,
              toolkit: request.toolkit,
              action: request.action,
              source: "tool_request",
              riskClass: "MEDIUM",
              dataSensitivity: inferDataSensitivity(request.toolkit),
              sideEffectType: inferSideEffectType(request.action),
              policyHash,
              idempotencyKey
            }
          )
        );
        blockedTasks.push(task);
        blocked = true;
        break;
      }

      const signature = toolRequestSignature({
        toolkit: request.toolkit,
        action: request.action,
        arguments: request.arguments
      });
      const cached = toolRequestCache.get(signature);
      if (cached) {
        receipts.push(...cached.receipts);
        usedToolRequestIds.push(cached.sourceRequestId);
        composedDeliverable = cached.deliverable;
        continue;
      }

      if (adapters.appendOrchestrationEvent) {
        await adapters.appendOrchestrationEvent({
          orgId: state.orgId,
          runId,
          taskId: task.taskId,
          attempt: baseAttempt,
          agentId,
          eventType: "TOOL_CALL_STARTED",
          idempotencyKey: `${taskDispatchIdempotencyKey({
            runId,
            taskId: task.taskId,
            attempt: baseAttempt
          })}:tool:${requestIndex}:start`,
          payload: {
            toolkit: request.toolkit,
            action: request.action
          }
        });
      }

      const toolResult = await adapters.executeToolRequest({
        orgId: state.orgId,
        userId: state.userId,
        request
      });
      if (!toolResult.ok) {
        warnings.push(
          `Tool request failed for ${request.role} (${request.toolkit}:${request.action}): ${toolResult.error?.message ?? "Unknown error"}`
        );
        blockedTasks.push(task);
        blocked = true;
        if (adapters.markDurableTaskState) {
          await adapters.markDurableTaskState({
            orgId: state.orgId,
            runId,
            taskId: task.taskId,
            nextState: "BLOCKED",
            attempts: baseAttempt
          });
        }
        if (adapters.appendOrchestrationEvent) {
          await adapters.appendOrchestrationEvent({
            orgId: state.orgId,
            runId,
            taskId: task.taskId,
            attempt: baseAttempt,
            agentId,
            eventType: "TASK_BLOCKED",
            payload: {
              reason: toolResult.error?.message ?? "Tool execution failed.",
              toolkit: request.toolkit,
              action: request.action
            }
          });
        }
        break;
      }

      const resultReceipts =
        toolResult.receipts && toolResult.receipts.length > 0
          ? toolResult.receipts
          : [
              defaultInternalReceipt({
                taskId: task.taskId,
                action: `${request.toolkit}:${request.action}`,
                output: toolResult.data ?? {}
              })
            ];
      for (let receiptIndex = 0; receiptIndex < resultReceipts.length; receiptIndex += 1) {
        const receipt = resultReceipts[receiptIndex]!;
        receipts.push(receipt);
        if (adapters.upsertToolReceipt) {
          await adapters.upsertToolReceipt({
            orgId: state.orgId,
            runId,
            taskId: task.taskId,
            receipt,
            idempotencyKey: toolCallIdempotencyKey({
              runId,
              taskId: task.taskId,
              toolCallIndex: requestIndex * 10 + receiptIndex,
              attempt: baseAttempt
            })
          });
        }
      }
      if (adapters.appendOrchestrationEvent) {
        await adapters.appendOrchestrationEvent({
          orgId: state.orgId,
          runId,
          taskId: task.taskId,
          attempt: baseAttempt,
          agentId,
          eventType: "TOOL_CALL_FINISHED",
          idempotencyKey: `${taskDispatchIdempotencyKey({
            runId,
            taskId: task.taskId,
            attempt: baseAttempt
          })}:tool:${requestIndex}:finish`,
          payload: {
            toolkit: request.toolkit,
            action: request.action,
            status: "success",
            receiptCount: resultReceipts.length
          }
        });
      }

      toolCallsExecuted += 1;
      const normalized = normalizeToolOutputForHub({
        role: request.role,
        toolkit: request.toolkit,
        action: request.action,
        data: toolResult.data ?? {}
      });
      composedDeliverable = normalized.content.slice(0, 600);
      usedToolRequestIds.push(request.requestId);
      toolRequestCache.set(signature, {
        sourceRequestId: request.requestId,
        summary: normalized.summary,
        deliverable: normalized.content.slice(0, 600),
        receipts: resultReceipts
      });
    }

    if (blocked) {
      continue;
    }

    const receiptVerification = adapters.verifyTaskReceipts
      ? await adapters.verifyTaskReceipts({
          orgId: state.orgId,
          runId,
          taskId: task.taskId
        })
      : {
          ok: receipts.length > 0,
          missingToolCallIds: [],
          receipts
        };
    if (!receiptVerification.ok || receiptVerification.receipts.length === 0) {
      warnings.push(
        `Task ${task.taskId} cannot complete because required tool receipts are missing (${receiptVerification.missingToolCallIds.join(", ")}).`
      );
      blockedTasks.push(task);
      if (adapters.markDurableTaskState) {
        await adapters.markDurableTaskState({
          orgId: state.orgId,
          runId,
          taskId: task.taskId,
          nextState: "BLOCKED",
          attempts: baseAttempt
        });
      }
      if (adapters.appendOrchestrationEvent) {
        await adapters.appendOrchestrationEvent({
          orgId: state.orgId,
          runId,
          taskId: task.taskId,
          attempt: baseAttempt,
          agentId,
          eventType: "TASK_BLOCKED",
          payload: {
            reason: "Missing required tool receipts.",
            missingToolCallIds: receiptVerification.missingToolCallIds
          }
        });
      }
      continue;
    }

    const hubEntry = await adapters.publishHubEntry({
      orgId: state.orgId,
      teamType: state.teamBlueprint.teamType,
      graphRunId: state.graphRunId,
      sourceRunId: runId,
      sourceTaskId: task.taskId,
      category: "operational_updates",
      title: `${task.title} output`,
      content: composedDeliverable,
      role: task.role,
      idempotencyKey: hubWriteIdempotencyKey({
        runId,
        taskId: task.taskId,
        outputName: "result"
      })
    });
    if (adapters.markDurableTaskState) {
      await adapters.markDurableTaskState({
        orgId: state.orgId,
        runId,
        taskId: task.taskId,
        nextState: "COMPLETED",
        attempts: baseAttempt,
        outputFileId: hubEntry.entryId,
        outputPayload: {
          deliverable: composedDeliverable,
          usedToolRequestIds
        }
      });
    }
    if (adapters.appendOrchestrationEvent) {
      await adapters.appendOrchestrationEvent({
        orgId: state.orgId,
        runId,
        taskId: task.taskId,
        attempt: baseAttempt,
        agentId,
        eventType: "TASK_COMPLETED",
        payload: {
          receiptCount: receiptVerification.receipts.length
        }
      });
    }

    completedTasks.push({
      ...task,
      state: "COMPLETED",
      attempts: baseAttempt,
      updatedAt: new Date().toISOString()
    });
    agentOutputs.push({
      role: task.role,
      taskId: task.taskId,
      summary: `Task completed: ${task.title}`,
      deliverable: composedDeliverable,
      usedToolRequestIds
    });
  }

  return {
    ...state,
    durableRunId,
    pendingTasks: [],
    inProgressTasks,
    blockedTasks,
    completedTasks,
    approvalRequests,
    agentOutputs,
    warnings,
    collaborationSummary: {
      completedTasks: completedTasks.length,
      blockedTasks: blockedTasks.length,
      approvalsRequired: approvalRequests.length,
      toolCallsExecuted
    }
  };
}
