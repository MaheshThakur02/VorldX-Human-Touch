import assert from "node:assert/strict";
import test from "node:test";

import { buildOrganizationMainAgentPrompt } from "../lib/agent/prompts/organizationMain.ts";

test("organization main prompt includes manager contract rules", () => {
  const prompt = buildOrganizationMainAgentPrompt({
    orgName: "Acme",
    mode: "execution",
    contextAvailable: true,
    includeDirectionSection: false
  });

  assert.match(prompt, /ROLE: Organization Manager/);
  assert.match(prompt, /MISSION: Acme/);
  assert.match(prompt, /You MUST NOT: claim a task is complete without a receipt ID proving it/);
  assert.match(prompt, /You MUST NOT: proceed past a failed ACK without escalating/);
  assert.match(prompt, /You MUST NOT: return a final response until all required tasks are terminal/);
});

test("organization main prompt includes required json output schema", () => {
  const prompt = buildOrganizationMainAgentPrompt({
    orgName: "Acme",
    mode: "execution",
    contextAvailable: true,
    includeDirectionSection: false
  });

  assert.match(prompt, /"delegations"/);
  assert.match(prompt, /"tool_budget"/);
  assert.match(prompt, /"approval_requests"/);
  assert.match(prompt, /"idempotency_key"/);
  assert.match(prompt, /"manager_checks"/);
  assert.match(prompt, /"blocked_tasks"/);
});

test("organization main prompt keeps honesty rule", () => {
  const prompt = buildOrganizationMainAgentPrompt({
    orgName: "Acme",
    mode: "execution",
    contextAvailable: false
  });

  assert.match(prompt, /HONESTY RULE:/);
  assert.match(prompt, /A blocked or failed response with a clear reason is more valuable/);
  assert.match(prompt, /You are rewarded for accurate reporting/);
});

test("chat mode keeps directional guidance behavior", () => {
  const withDirection = buildOrganizationMainAgentPrompt({
    orgName: "Acme",
    mode: "chat",
    contextAvailable: true,
    includeDirectionSection: true
  });
  const withoutDirection = buildOrganizationMainAgentPrompt({
    orgName: "Acme",
    mode: "chat",
    contextAvailable: true,
    includeDirectionSection: false
  });

  assert.match(withDirection, /Include a final `Direction:` section/);
  assert.match(withoutDirection, /Do not append `Direction:` unless execution\/planning intent is explicit\./);
});
