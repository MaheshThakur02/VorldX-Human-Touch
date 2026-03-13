import assert from "node:assert/strict";
import test from "node:test";

import type { OrganizationGraphAdapters } from "../lib/langgraph/adapters/contracts.ts";
import { SwarmOrganizationGraph } from "../lib/langgraph/swarm-organization-graph.ts";
import type { ExistingSquadMember, ToolRequest } from "../lib/langgraph/state.ts";

function createFakeAdapters(options?: {
  existingSquad?: ExistingSquadMember[];
  hubExists?: boolean;
  failRole?: string;
  toolFailure?: boolean;
}) {
  const existingSquad = [...(options?.existingSquad ?? [])];
  const hubEntries: Array<{ category: string; title: string; content: string; sourceTaskId: string }> = [];
  const approvalReasons: string[] = [];
  const toolCalls: Array<{ toolkit: string; action: string }> = [];
  const logs: Array<{ stage: string; latencyMs: number }> = [];
  let memorySearchCalls = 0;
  const durableRuns = new Map<string, string>();
  const durableTasks = new Map<
    string,
    {
      taskId: string;
      state: "PENDING" | "ASSIGNED" | "ACKED" | "RUNNING" | "BLOCKED" | "COMPLETED" | "FAILED" | "TIMEOUT";
      attempts: number;
      objective: string;
      outputFileId: string | null;
      outputPayload: Record<string, unknown> | null;
      toolReceipts: Array<{
        tool_call_id: string;
        provider_request_id: string;
        status: string;
        started_at: string;
        ended_at: string;
        normalized_output_hash: string;
      }>;
      waived: boolean;
    }
  >();
  const approvalByIdem = new Map<
    string,
    {
      checkpointId: string;
      status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
    }
  >();

  const adapters: OrganizationGraphAdapters = {
    async loadOrganizationContext() {
      return {
        orgId: "org-1",
        orgName: "Acme Labs",
        workspaceId: "org-1",
        managerName: "Swarm",
        availableToolkits: [
          "gmail",
          "slack",
          "hubspot",
          "salesforce",
          "googleads",
          "googledocs",
          "notion",
          "zoom"
        ]
      };
    },
    async loadExistingSquad() {
      return [...existingSquad];
    },
    async persistSquadAgents(input) {
      return input.agents.map((agent) => {
        if (options?.failRole && agent.role === options.failRole) {
          return {
            role: agent.role,
            personnelId: null,
            agentId: null,
            status: "failed" as const,
            error: "Injected persistence failure."
          };
        }

        const existing = existingSquad.find(
          (member) =>
            member.type === "AI" &&
            member.role.toLowerCase() === agent.role.toLowerCase()
        );
        if (existing && input.reuseExistingAgents) {
          return {
            role: agent.role,
            personnelId: existing.personnelId,
            agentId: `agent-${existing.personnelId}`,
            status: "reused" as const
          };
        }

        const personnelId = `p-${existingSquad.length + 1}`;
        existingSquad.push({
          personnelId,
          name: agent.name,
          role: agent.role,
          type: "AI",
          status: "IDLE",
          assignedOAuthIds: []
        });
        return {
          role: agent.role,
          personnelId,
          agentId: `agent-${personnelId}`,
          status: "created" as const
        };
      });
    },
    async initializeOrReuseHubContext() {
      return {
        workspaceId: "org-1",
        existed: options?.hubExists === true,
        missionEntryId: options?.hubExists ? "mission-existing" : "mission-created"
      };
    },
    async publishHubEntry(input) {
      hubEntries.push({
        category: input.category,
        title: input.title,
        content: input.content,
        sourceTaskId: input.sourceTaskId
      });
      return {
        entryId: `hub-${hubEntries.length}`,
        category: input.category
      };
    },
    async searchSharedKnowledge() {
      memorySearchCalls += 1;
      return [
        {
          id: "m-1",
          source: "agent_memory",
          title: "Prior strategy",
          summary: "Prior campaign and squad history.",
          score: 0.78
        }
      ];
    },
    async executeToolRequest(input) {
      toolCalls.push({
        toolkit: input.request.toolkit,
        action: input.request.action
      });
      if (options?.toolFailure) {
        return {
          ok: false,
          toolkit: input.request.toolkit,
          action: input.request.action,
          error: {
            code: "TOOLS_UNAVAILABLE",
            message: "Injected tool failure."
          }
        };
      }
      return {
        ok: true,
        toolkit: input.request.toolkit,
        action: input.request.action,
        toolSlug: `${input.request.toolkit.toUpperCase()}_${input.request.action}`,
        data: {
          ok: true,
          value: "tool output"
        }
      };
    },
    async createApprovalRequest(input) {
      const existing = approvalByIdem.get(input.idempotencyKey);
      if (existing) {
        return {
          checkpointId: existing.checkpointId,
          status: existing.status,
          idempotencyKey: input.idempotencyKey
        };
      }
      approvalReasons.push(input.reason);
      const checkpoint = {
        checkpointId: `approval-${approvalReasons.length}`,
        status: "PENDING" as const
      };
      approvalByIdem.set(input.idempotencyKey, checkpoint);
      return {
        checkpointId: checkpoint.checkpointId,
        status: checkpoint.status,
        idempotencyKey: input.idempotencyKey
      };
    },
    async ensureDurableRun(input) {
      const existing = durableRuns.get(input.graphRunId);
      if (existing) {
        return { runId: existing };
      }
      const runId = `r-${input.graphRunId}`;
      durableRuns.set(input.graphRunId, runId);
      return { runId };
    },
    async persistDurableTasks(input) {
      for (const task of input.tasks) {
        const key = `${input.runId}:${task.task_id}`;
        if (durableTasks.has(key)) continue;
        durableTasks.set(key, {
          taskId: task.task_id,
          state: task.state,
          attempts: task.attempts,
          objective: task.objective,
          outputFileId: null,
          outputPayload: null,
          toolReceipts: [],
          waived: false
        });
      }
      return adapters.readDurableTaskSnapshots!({
        orgId: input.orgId,
        runId: input.runId
      });
    },
    async readDurableTaskSnapshots(input) {
      const prefix = `${input.runId}:`;
      return [...durableTasks.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => ({
          taskId: value.taskId,
          state: value.state,
          attempts: value.attempts,
          objective: value.objective,
          output: {
            outputFileId: value.outputFileId,
            payload: value.outputPayload
          },
          toolReceipts: [...value.toolReceipts],
          waived: value.waived
        }));
    },
    async markDurableTaskState(input) {
      const key = `${input.runId}:${input.taskId}`;
      const existing = durableTasks.get(key);
      if (!existing) return null;
      const updated = {
        ...existing,
        state: input.nextState,
        attempts: typeof input.attempts === "number" ? input.attempts : existing.attempts,
        outputFileId: input.outputFileId !== undefined ? input.outputFileId : existing.outputFileId,
        outputPayload:
          input.outputPayload !== undefined ? input.outputPayload : existing.outputPayload,
        waived: input.waived !== undefined ? input.waived : existing.waived
      };
      durableTasks.set(key, updated);
      return {
        taskId: updated.taskId,
        state: updated.state,
        attempts: updated.attempts,
        objective: updated.objective,
        output: {
          outputFileId: updated.outputFileId,
          payload: updated.outputPayload
        },
        toolReceipts: [...updated.toolReceipts],
        waived: updated.waived
      };
    },
    async upsertToolReceipt(input) {
      const key = `${input.runId}:${input.taskId}`;
      const existing = durableTasks.get(key);
      if (!existing) {
        throw new Error("Task not found for receipt.");
      }
      if (!existing.toolReceipts.some((receipt) => receipt.tool_call_id === input.receipt.tool_call_id)) {
        existing.toolReceipts.push(input.receipt);
        durableTasks.set(key, existing);
      }
      return input.receipt;
    },
    async verifyTaskReceipts(input) {
      const key = `${input.runId}:${input.taskId}`;
      const existing = durableTasks.get(key);
      if (!existing) {
        return {
          ok: false,
          missingToolCallIds: [input.taskId],
          receipts: []
        };
      }
      return {
        ok: existing.toolReceipts.length > 0,
        missingToolCallIds: existing.toolReceipts.length > 0 ? [] : [input.taskId],
        receipts: [...existing.toolReceipts]
      };
    },
    async appendOrchestrationEvent() {
      // no-op in test harness
    },
    async runCompletionBarrier(input) {
      const snapshots = await adapters.readDurableTaskSnapshots!({
        orgId: input.orgId,
        runId: input.runId
      });
      const blockingTaskIds = snapshots
        .filter((task) => !task.waived)
        .filter(
          (task) =>
            task.state === "PENDING" ||
            task.state === "ASSIGNED" ||
            task.state === "ACKED" ||
            task.state === "RUNNING" ||
            (task.state === "COMPLETED" && !task.output.outputFileId && !task.output.payload)
        )
        .map((task) => task.taskId);
      return {
        ok: blockingTaskIds.length === 0,
        blockingTaskIds,
        report: snapshots
      };
    },
    async logGraphEvent(input) {
      logs.push({
        stage: input.stage,
        latencyMs: input.latencyMs
      });
    }
  };

  return {
    adapters,
    existingSquad,
    hubEntries,
    approvalReasons,
    toolCalls,
    logs,
    getMemorySearchCalls: () => memorySearchCalls
  };
}

function runGraph(input: {
  request: string;
  featureEnabled?: boolean;
  existingSquad?: ExistingSquadMember[];
  hubExists?: boolean;
  failRole?: string;
  preseedToolRequests?: ToolRequest[];
  toolFailure?: boolean;
}) {
  const fake = createFakeAdapters({
    existingSquad: input.existingSquad,
    hubExists: input.hubExists,
    failRole: input.failRole,
    toolFailure: input.toolFailure
  });
  const graph = new SwarmOrganizationGraph({
    adapters: fake.adapters
  });

  return {
    fake,
    result: graph.run({
      orgId: "org-1",
      userId: "user-1",
      sessionId: "session-1",
      traceId: "trace-1",
      userRequest: input.request,
      featureFlagEnabled: input.featureEnabled ?? true,
      preseedToolRequests: input.preseedToolRequests
    })
  };
}

test("non-team requests still run through unified organization graph", async () => {
  const { result } = runGraph({
    request: "What are our latest quarterly metrics?"
  });
  const run = await result;

  assert.equal(run.handled, true);
  assert.equal(run.requestType, "NORMAL_SWARM_REQUEST");
});

test("feature flag disabled still uses unified durable routing with warning", async () => {
  const enabledRun = await runGraph({
    request: "Start my marketing team",
    featureEnabled: true
  }).result;
  const disabledRun = await runGraph({
    request: "Start my marketing team",
    featureEnabled: false
  }).result;

  assert.equal(enabledRun.handled, true);
  assert.equal(disabledRun.handled, true);
  assert.ok(
    disabledRun.warnings.some((item) =>
      item.includes("LangGraph feature flag is disabled")
    )
  );
});

test("\"Start my marketing team\" creates expected agent roles", async () => {
  const { fake, result } = runGraph({
    request: "Start my marketing team"
  });
  const run = await result;
  const roles = fake.existingSquad.map((member) => member.role);

  assert.equal(run.handled, true);
  assert.ok(roles.includes("Marketing Strategist"));
  assert.ok(roles.includes("Content Strategist"));
  assert.ok(roles.includes("Social Media Manager"));
  assert.ok(roles.includes("Performance Analyst"));
  assert.ok(roles.includes("Brand Researcher"));
});

test("duplicate team creation reuses existing squad agents safely", async () => {
  const existingSquad: ExistingSquadMember[] = [
    {
      personnelId: "p-1",
      name: "Marketing Strategist",
      role: "Marketing Strategist",
      type: "AI",
      status: "IDLE",
      assignedOAuthIds: []
    },
    {
      personnelId: "p-2",
      name: "Content Strategist",
      role: "Content Strategist",
      type: "AI",
      status: "IDLE",
      assignedOAuthIds: []
    },
    {
      personnelId: "p-3",
      name: "Social Media Manager",
      role: "Social Media Manager",
      type: "AI",
      status: "IDLE",
      assignedOAuthIds: []
    },
    {
      personnelId: "p-4",
      name: "Performance Analyst",
      role: "Performance Analyst",
      type: "AI",
      status: "IDLE",
      assignedOAuthIds: []
    },
    {
      personnelId: "p-5",
      name: "Brand Researcher",
      role: "Brand Researcher",
      type: "AI",
      status: "IDLE",
      assignedOAuthIds: []
    }
  ];

  const { result } = runGraph({
    request: "Start my marketing team",
    existingSquad
  });
  const run = await result;

  assert.equal(run.handled, true);
  assert.equal(run.createdAgentCount, 0);
  assert.equal(run.reusedAgentCount, 5);
});

test("manual squad composition with humans remains intact", async () => {
  const existingSquad: ExistingSquadMember[] = [
    {
      personnelId: "human-1",
      name: "Riya",
      role: "Growth Manager",
      type: "HUMAN",
      status: "ACTIVE",
      assignedOAuthIds: []
    }
  ];

  const { fake, result } = runGraph({
    request: "Build my content team",
    existingSquad
  });
  await result;

  assert.ok(fake.existingSquad.some((member) => member.personnelId === "human-1"));
});

test("hub context is initialized or reused correctly", async () => {
  const created = await runGraph({
    request: "Create a research squad",
    hubExists: false
  }).result;
  const reused = await runGraph({
    request: "Create a research squad",
    hubExists: true
  }).result;

  assert.equal(created.handled, true);
  assert.equal(reused.handled, true);
  assert.match(created.reply, /Hub workspace:\sinitialized/i);
  assert.match(reused.reply, /Hub workspace:\sreused/i);
});

test("graph uses shared memory retrieval adapter", async () => {
  const { fake, result } = runGraph({
    request: "Set up my sales team"
  });
  await result;

  assert.equal(fake.getMemorySearchCalls(), 1);
});

test("langgraph agent tool requests execute via adapter and publish hub output", async () => {
  const { fake, result } = runGraph({
    request: "Create a launch team",
    preseedToolRequests: [
      {
        requestId: "tool-1",
        taskId: "task-1",
        role: "Team Manager",
        toolkit: "gmail",
        action: "LIST_RECENT_EMAILS",
        arguments: { limit: 3 },
        requiresApproval: false
      }
    ]
  });
  const run = await result;

  assert.equal(run.handled, true);
  assert.ok(fake.toolCalls.length >= 1);
  assert.ok(fake.hubEntries.length >= 1);
  assert.ok(fake.hubEntries.some((item) => item.category === "operational_updates"));
  assert.ok(fake.hubEntries.every((item) => item.sourceTaskId.length > 0));
});

test("duplicate tool requests are deduplicated in a single collaboration cycle", async () => {
  const { fake, result } = runGraph({
    request: "Create a launch team",
    preseedToolRequests: [
      {
        requestId: "tool-1",
        taskId: "task-1",
        role: "Team Manager",
        toolkit: "gmail",
        action: "LIST_RECENT_EMAILS",
        arguments: { limit: 3 },
        requiresApproval: false
      },
      {
        requestId: "tool-2",
        taskId: "task-2",
        role: "Research Analyst",
        toolkit: "gmail",
        action: "LIST_RECENT_EMAILS",
        arguments: { limit: 3 },
        requiresApproval: false
      }
    ]
  });
  const run = await result;

  assert.equal(run.handled, true);
  assert.equal(fake.toolCalls.length, 1);
  assert.ok(fake.hubEntries.length >= 1);
});

test("approval-required actions still route through approval flow", async () => {
  const { fake, result } = runGraph({
    request: "Set up my sales team",
    preseedToolRequests: [
      {
        requestId: "tool-2",
        taskId: "task-2",
        role: "Outreach Copy Agent",
        toolkit: "gmail",
        action: "SEND_EMAIL",
        arguments: { to: "test@example.com", subject: "Hi", body: "Hello" },
        requiresApproval: true,
        reason: "Outbound email requires approval."
      }
    ]
  });
  const run = await result;

  assert.equal(run.handled, true);
  assert.ok(run.approvalPendingCount >= 1);
  assert.equal(fake.toolCalls.length, 0);
  assert.ok(fake.approvalReasons.length >= 1);
});

test("one agent persistence failure does not corrupt team bootstrap", async () => {
  const { result } = runGraph({
    request: "Start my marketing team",
    failRole: "Performance Analyst"
  });
  const run = await result;

  assert.equal(run.handled, true);
  assert.ok(run.warnings.some((item) => item.includes("Performance Analyst")));
  assert.ok(run.createdAgentCount >= 3);
});

test("one tool failure does not break full team graph", async () => {
  const { fake, result } = runGraph({
    request: "Create a research squad",
    toolFailure: true,
    preseedToolRequests: [
      {
        requestId: "tool-3",
        taskId: "task-3",
        role: "Source Discovery Agent",
        toolkit: "notion",
        action: "SEARCH",
        arguments: { query: "competitor analysis" },
        requiresApproval: false
      }
    ]
  });
  const run = await result;

  assert.equal(run.handled, true);
  assert.ok(fake.toolCalls.length >= 1);
  assert.ok(run.warnings.length > 0);
});

test("swarm manager summary is coherent", async () => {
  const { result } = runGraph({
    request: "Build my content team"
  });
  const run = await result;

  assert.equal(run.handled, true);
  assert.match(run.reply, /Swarm manager update/i);
  assert.match(run.reply, /Role assignments/i);
  assert.match(run.reply, /Shared goal/i);
  assert.match(run.reply, /Suggested next steps/i);
});
