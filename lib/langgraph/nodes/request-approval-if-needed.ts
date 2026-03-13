import { createHash } from "node:crypto";

import type { OrganizationGraphAdapters } from "../adapters/contracts.ts";
import type { SwarmOrganizationState } from "../state.ts";
import {
  evaluateDeterministicApprovalPolicy,
  type ApprovalDataSensitivity,
  type ApprovalRiskClass,
  type ApprovalSideEffectType
} from "../../orchestration/approval-policy-engine.ts";

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

function toPolicyHash(value: Record<string, unknown>) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function extractTaskId(metadata: Record<string, unknown>) {
  return typeof metadata.taskId === "string" ? metadata.taskId.trim() : "";
}

function parseRiskClass(metadata: Record<string, unknown>): ApprovalRiskClass {
  const value = typeof metadata.riskClass === "string" ? metadata.riskClass.trim().toUpperCase() : "";
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") {
    return value;
  }
  return "MEDIUM";
}

function parseDataSensitivity(metadata: Record<string, unknown>): ApprovalDataSensitivity {
  const value =
    typeof metadata.dataSensitivity === "string"
      ? metadata.dataSensitivity.trim().toUpperCase()
      : "";
  if (value === "PII" || value === "FINANCIAL" || value === "EXTERNAL" || value === "NONE") {
    return value;
  }
  return "NONE";
}

function parseSideEffectType(metadata: Record<string, unknown>): ApprovalSideEffectType {
  const value =
    typeof metadata.sideEffectType === "string"
      ? metadata.sideEffectType.trim().toUpperCase()
      : "";
  if (
    value === "EXTERNAL_WRITE" ||
    value === "PAYMENT" ||
    value === "COMMUNICATION_SEND" ||
    value === "NONE"
  ) {
    return value;
  }
  return "NONE";
}

export async function requestApprovalIfNeededNode(
  state: SwarmOrganizationState,
  adapters: OrganizationGraphAdapters
): Promise<SwarmOrganizationState> {
  if (state.approvalRequests.length === 0) {
    return {
      ...state,
      approvalStatus: "NONE"
    };
  }

  const runId = state.durableRunId ?? `r_${state.graphRunId.replace(/^lg-run-/, "")}`;
  const resolved = [];
  for (const request of state.approvalRequests) {
    const metadata = request.metadata ?? {};
    const taskId = extractTaskId(metadata);
    if (!taskId) {
      throw new Error("Approval request is missing taskId in metadata.");
    }
    const policyDecision = evaluateDeterministicApprovalPolicy({
      runId,
      taskId,
      reason: request.reason,
      riskClass: parseRiskClass(metadata),
      dataSensitivity: parseDataSensitivity(metadata),
      sideEffectType: parseSideEffectType(metadata)
    });
    if (policyDecision.outcome === "APPROVED") {
      resolved.push({
        ...request,
        requestId: `${runId}:${taskId}:${policyDecision.policyHash}`,
        status: "APPROVED" as const,
        checkpointId: null,
        metadata: {
          ...metadata,
          runId,
          taskId,
          policyHash: policyDecision.policyHash,
          fallbackOnExpired: policyDecision.fallbackOnExpired
        }
      });
      continue;
    }
    if (policyDecision.outcome === "REJECTED") {
      resolved.push({
        ...request,
        requestId: `${runId}:${taskId}:${policyDecision.policyHash}`,
        status: "REJECTED" as const,
        checkpointId: null,
        metadata: {
          ...metadata,
          runId,
          taskId,
          policyHash: policyDecision.policyHash,
          fallbackOnExpired: policyDecision.fallbackOnExpired
        }
      });
      continue;
    }
    const policyHash =
      typeof metadata.policyHash === "string" && metadata.policyHash.trim().length > 0
        ? metadata.policyHash
        : policyDecision.policyHash ||
          toPolicyHash({
            reason: request.reason,
            metadata
          });
    const idempotencyKey =
      typeof metadata.idempotencyKey === "string" && metadata.idempotencyKey.trim().length > 0
        ? metadata.idempotencyKey
        : `${runId}:${taskId}:${policyHash}`;

    const created = await adapters.createApprovalRequest({
      orgId: state.orgId,
      reason: request.reason,
      metadata: {
        ...metadata,
        runId,
        taskId,
        policyHash,
        fallbackOnExpired: policyDecision.fallbackOnExpired,
        idempotencyKey
      },
      idempotencyKey,
      runId,
      taskId,
      policyHash
    });
    resolved.push({
      ...request,
      requestId: created.idempotencyKey,
      status: created.status,
      checkpointId: created.checkpointId,
      metadata: {
        ...metadata,
        runId,
        taskId,
        policyHash,
        fallbackOnExpired: policyDecision.fallbackOnExpired,
        idempotencyKey: created.idempotencyKey
      }
    });
  }

  const pending = resolved.filter((item) => item.status === "PENDING").length;
  const rejectedOrExpired = resolved.filter(
    (item) => item.status === "REJECTED" || item.status === "EXPIRED"
  ).length;

  return {
    ...state,
    approvalRequests: resolved,
    approvalStatus: pending > 0 ? "PENDING" : rejectedOrExpired > 0 ? "PARTIAL" : "APPROVED"
  };
}
