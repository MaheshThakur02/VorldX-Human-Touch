import { createHash } from "node:crypto";

export type ApprovalRiskClass = "HIGH" | "MEDIUM" | "LOW";
export type ApprovalDataSensitivity = "PII" | "FINANCIAL" | "EXTERNAL" | "NONE";
export type ApprovalSideEffectType = "EXTERNAL_WRITE" | "PAYMENT" | "COMMUNICATION_SEND" | "NONE";
export type ApprovalDecisionOutcome = "APPROVED" | "REJECTED" | "EXPIRED";
export type ApprovalExpiredFallback = "REPLAN" | "CANCEL" | "LIMITED_CONTINUE";

export interface DeterministicApprovalPolicyInput {
  runId: string;
  taskId: string;
  reason: string;
  riskClass: ApprovalRiskClass;
  dataSensitivity: ApprovalDataSensitivity;
  sideEffectType: ApprovalSideEffectType;
}

export interface DeterministicApprovalPolicyDecision {
  outcome: ApprovalDecisionOutcome;
  fallbackOnExpired: ApprovalExpiredFallback;
  policyHash: string;
}

export function buildApprovalPolicyHash(input: DeterministicApprovalPolicyInput) {
  const serialized = [
    input.runId,
    input.taskId,
    input.reason.trim().toLowerCase(),
    input.riskClass,
    input.dataSensitivity,
    input.sideEffectType
  ].join("|");
  return createHash("sha256").update(serialized).digest("hex");
}

export function evaluateDeterministicApprovalPolicy(
  input: DeterministicApprovalPolicyInput
): DeterministicApprovalPolicyDecision {
  const policyHash = buildApprovalPolicyHash(input);

  if (input.riskClass === "HIGH") {
    return {
      outcome: "EXPIRED",
      fallbackOnExpired: "CANCEL",
      policyHash
    };
  }

  if (input.sideEffectType === "PAYMENT" && input.dataSensitivity === "FINANCIAL") {
    return {
      outcome: "EXPIRED",
      fallbackOnExpired: "REPLAN",
      policyHash
    };
  }

  if (
    input.dataSensitivity === "PII" ||
    input.sideEffectType === "COMMUNICATION_SEND" ||
    input.sideEffectType === "EXTERNAL_WRITE"
  ) {
    return {
      outcome: "EXPIRED",
      fallbackOnExpired: "LIMITED_CONTINUE",
      policyHash
    };
  }

  return {
    outcome: "APPROVED",
    fallbackOnExpired: "LIMITED_CONTINUE",
    policyHash
  };
}
