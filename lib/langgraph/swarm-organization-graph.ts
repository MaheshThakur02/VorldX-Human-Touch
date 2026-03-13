import { randomUUID } from "node:crypto";

import type {
  OrganizationGraphRunInput,
  OrganizationGraphRunResult,
  OrganizationGraphRuntimeOptions
} from "./adapters/contracts.ts";
import { classifyRequestTypeNode } from "./nodes/classify-request-type.ts";
import { ingestUserRequestNode } from "./nodes/ingest-user-request.ts";
import { loadExistingSquadStateNode } from "./nodes/load-existing-squad-state.ts";
import { loadOrgContextNode } from "./nodes/load-org-context.ts";
import { respondAsSwarmNode } from "./nodes/respond-as-swarm.ts";
import { summarizeTeamStatusNode } from "./nodes/summarize-team-status.ts";
import { runAgentCollaborationSubgraph } from "./subgraphs/agent-collaboration-subgraph.ts";
import { runApprovalAdapterSubgraph } from "./subgraphs/approval-adapter-subgraph.ts";
import { runMemoryRetrievalAdapterSubgraph } from "./subgraphs/memory-retrieval-adapter-subgraph.ts";
import { runTeamCreationSubgraph } from "./subgraphs/team-creation-subgraph.ts";
import {
  createInitialSwarmOrganizationState,
  type SwarmOrganizationState
} from "./state.ts";

let langGraphPackageState: "unknown" | "present" | "missing" = "unknown";

async function detectLangGraphPackage() {
  if (langGraphPackageState !== "unknown") {
    return langGraphPackageState === "present";
  }

  try {
    const importModule = new Function(
      "modulePath",
      "return import(modulePath);"
    ) as (modulePath: string) => Promise<unknown>;
    await importModule("@langchain/langgraph");
    langGraphPackageState = "present";
    return true;
  } catch {
    langGraphPackageState = "missing";
    return false;
  }
}

export class SwarmOrganizationGraph {
  private readonly adapters: OrganizationGraphRuntimeOptions["adapters"];

  constructor(options: OrganizationGraphRuntimeOptions) {
    this.adapters = options.adapters;
  }

  private async runStage(
    state: SwarmOrganizationState,
    stage: string,
    fn: (current: SwarmOrganizationState) => Promise<SwarmOrganizationState> | SwarmOrganizationState
  ) {
    const started = Date.now();
    const next = await fn(state);
    const latencyMs = Date.now() - started;

    await this.adapters.logGraphEvent({
      orgId: next.orgId,
      graphRunId: next.graphRunId,
      traceId: next.traceId,
      stage,
      latencyMs,
      message: `Stage ${stage} completed.`,
      metadata: {
        requestType: next.requestType,
        teamType: next.teamBlueprint?.teamType ?? null,
        approvals: next.approvalRequests.length
      }
    });

    return next;
  }

  async run(input: OrganizationGraphRunInput): Promise<OrganizationGraphRunResult> {
    const graphRunId = `lg-run-${randomUUID().slice(0, 10)}`;
    let state = createInitialSwarmOrganizationState({
      userRequest: input.userRequest,
      userId: input.userId,
      orgId: input.orgId,
      sessionId: input.sessionId,
      graphRunId,
      traceId: input.traceId,
      featureFlagEnabled: input.featureFlagEnabled
    });
    if (input.preseedToolRequests && input.preseedToolRequests.length > 0) {
      state = {
        ...state,
        toolRequests: input.preseedToolRequests
      };
    }

    const langGraphAvailable = await detectLangGraphPackage();
    if (!langGraphAvailable) {
      state = {
        ...state,
        warnings: [
          ...state.warnings,
          "LangGraph package unavailable in runtime; deterministic graph fallback is active."
        ]
      };
    }

    try {
      state = await this.runStage(state, "ingest_user_request", (current) =>
        ingestUserRequestNode(current)
      );
      state = await this.runStage(state, "classify_request_type", (current) =>
        classifyRequestTypeNode(current)
      );

      if (!state.featureFlagEnabled) {
        state = {
          ...state,
          warnings: [
            ...state.warnings,
            "LangGraph feature flag is disabled, but unified durable routing remains active."
          ]
        };
      }

      state = await this.runStage(state, "load_org_context", (current) =>
        loadOrgContextNode(current, this.adapters)
      );
      state = await this.runStage(state, "load_existing_squad_state", (current) =>
        loadExistingSquadStateNode(current, this.adapters)
      );
      state = await this.runStage(state, "load_shared_knowledge", (current) =>
        runMemoryRetrievalAdapterSubgraph(current, this.adapters)
      );
      state = await this.runStage(state, "team_creation_subgraph", (current) =>
        runTeamCreationSubgraph(current, this.adapters)
      );
      state = await this.runStage(state, "agent_collaboration_subgraph", (current) =>
        runAgentCollaborationSubgraph(current, this.adapters)
      );
      state = await this.runStage(state, "approval_adapter_subgraph", (current) =>
        runApprovalAdapterSubgraph(current, this.adapters)
      );
      state = await this.runStage(state, "summarize_team_status", (current) =>
        summarizeTeamStatusNode(current)
      );
      state = await this.runStage(state, "respond_as_swarm", (current) => respondAsSwarmNode(current));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown LangGraph execution error.";
      state = {
        ...state,
        errors: [...state.errors, message],
        finalUserResponse: `Orchestration run failed: ${message}`
      };
    }

    const createdAgentCount = state.squadWriteResults.filter((item) => item.status === "created").length;
    const reusedAgentCount = state.squadWriteResults.filter((item) => item.status === "reused").length;
    const approvalPendingCount = state.approvalRequests.filter(
      (item) => item.status === "PENDING"
    ).length;

    return {
      handled: true,
      reply: state.finalUserResponse,
      reason:
        state.errors.length > 0
          ? "Handled by LangGraph organization path with orchestration errors."
          : "Handled by LangGraph organization path.",
      graphRunId: state.graphRunId,
      requestType: state.requestType,
      warnings: [...state.warnings, ...state.errors],
      createdAgentCount,
      reusedAgentCount,
      approvalPendingCount
    };
  }
}
