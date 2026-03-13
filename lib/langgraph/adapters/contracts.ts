import type {
  ApprovalRequest,
  CreatedAgentSpec,
  ExistingSquadMember,
  SharedKnowledgeRef,
  SquadWriteResult,
  SwarmTeamType,
  ToolRequest
} from "../state.ts";
import type {
  PersistedTaskSchema,
  PersistedToolReceipt
} from "@/lib/orchestration/task-schema";
import type { OrchestrationEventType } from "@/lib/orchestration/event-log";

export interface LangGraphOrganizationContext {
  orgId: string;
  orgName: string;
  workspaceId: string;
  managerName: string;
  availableToolkits: string[];
}

export interface ToolExecutionResult {
  ok: boolean;
  toolkit: string;
  action: string;
  toolSlug?: string;
  data?: Record<string, unknown>;
  receipts?: PersistedToolReceipt[];
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

export interface HubEntryResult {
  entryId: string;
  category: string;
}

export interface HubContextResult {
  workspaceId: string;
  existed: boolean;
  missionEntryId: string | null;
}

export interface ApprovalRequestResult {
  checkpointId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  idempotencyKey: string;
}

export interface DurableTaskSnapshot {
  taskId: string;
  state: PersistedTaskSchema["state"];
  attempts: number;
  objective: string;
  output: {
    outputFileId: string | null;
    payload: Record<string, unknown> | null;
  };
  toolReceipts: PersistedToolReceipt[];
  waived: boolean;
}

export interface OrganizationGraphAdapters {
  loadOrganizationContext(input: {
    orgId: string;
    userId: string;
  }): Promise<LangGraphOrganizationContext>;
  loadExistingSquad(input: { orgId: string }): Promise<ExistingSquadMember[]>;
  persistSquadAgents(input: {
    orgId: string;
    userId: string;
    teamType: SwarmTeamType;
    graphRunId: string;
    mission: string;
    agents: CreatedAgentSpec[];
    reuseExistingAgents: boolean;
  }): Promise<SquadWriteResult[]>;
  initializeOrReuseHubContext(input: {
    orgId: string;
    teamType: SwarmTeamType;
    mission: string;
    graphRunId: string;
  }): Promise<HubContextResult>;
  publishHubEntry(input: {
    orgId: string;
    teamType: SwarmTeamType;
    graphRunId: string;
    sourceRunId?: string;
    sourceTaskId: string;
    category: string;
    title: string;
    content: string;
    role?: string;
    idempotencyKey?: string;
  }): Promise<HubEntryResult>;
  searchSharedKnowledge(input: {
    orgId: string;
    userId: string;
    query: string;
    limit: number;
  }): Promise<SharedKnowledgeRef[]>;
  executeToolRequest(input: {
    orgId: string;
    userId: string;
    request: ToolRequest;
  }): Promise<ToolExecutionResult>;
  createApprovalRequest(input: {
    orgId: string;
    reason: string;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
    runId: string;
    taskId: string;
    policyHash: string;
  }): Promise<ApprovalRequestResult>;
  ensureDurableRun?(input: {
    orgId: string;
    userId: string;
    graphRunId: string;
    prompt: string;
  }): Promise<{ runId: string }>;
  persistDurableTasks?(input: {
    orgId: string;
    runId: string;
    tasks: PersistedTaskSchema[];
  }): Promise<DurableTaskSnapshot[]>;
  readDurableTaskSnapshots?(input: { orgId: string; runId: string }): Promise<DurableTaskSnapshot[]>;
  markDurableTaskState?(input: {
    orgId: string;
    runId: string;
    taskId: string;
    nextState: PersistedTaskSchema["state"];
    attempts?: number;
    outputFileId?: string | null;
    outputPayload?: Record<string, unknown> | null;
    waived?: boolean;
  }): Promise<DurableTaskSnapshot | null>;
  upsertToolReceipt?(input: {
    orgId: string;
    runId: string;
    taskId: string;
    receipt: PersistedToolReceipt;
    idempotencyKey: string;
  }): Promise<PersistedToolReceipt>;
  verifyTaskReceipts?(input: {
    orgId: string;
    runId: string;
    taskId: string;
  }): Promise<{ ok: boolean; missingToolCallIds: string[]; receipts: PersistedToolReceipt[] }>;
  appendOrchestrationEvent?(input: {
    orgId: string;
    runId: string;
    taskId: string;
    attempt: number;
    agentId: string;
    eventType: OrchestrationEventType;
    idempotencyKey?: string;
    payload?: Record<string, unknown>;
  }): Promise<void>;
  runCompletionBarrier?(input: {
    orgId: string;
    runId: string;
  }): Promise<{ ok: boolean; blockingTaskIds: string[]; report: DurableTaskSnapshot[] }>;
  logGraphEvent(input: {
    orgId: string;
    graphRunId: string;
    traceId: string;
    stage: string;
    latencyMs: number;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface OrganizationGraphRuntimeOptions {
  adapters: OrganizationGraphAdapters;
}

export interface OrganizationGraphRunInput {
  orgId: string;
  userId: string;
  sessionId: string;
  traceId: string;
  userRequest: string;
  featureFlagEnabled: boolean;
  preseedToolRequests?: ToolRequest[];
}

export interface OrganizationGraphRunResult {
  handled: boolean;
  reply: string;
  reason: string;
  graphRunId: string;
  requestType: string;
  warnings: string[];
  createdAgentCount: number;
  reusedAgentCount: number;
  approvalPendingCount: number;
}

export interface ApprovalSubgraphInput {
  orgId: string;
  request: ApprovalRequest;
}
