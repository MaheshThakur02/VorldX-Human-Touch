import "server-only";

import type { ActiveDraft } from "../run/email-request-parser.ts";

export interface EmailWriterOutput {
  subject: string;
  body: string;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }
    const sliced = candidate.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(sliced) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export function buildEmailWriterPrompt(input: {
  userPrompt: string;
  recipientEmail: string;
  recipientName?: string;
  extraContext?: string;
  activeDraft?: ActiveDraft | null;
}) {
  const activeDraftContext = input.activeDraft
    ? [
        "ACTIVE DRAFT:",
        `Subject: ${input.activeDraft.subject}`,
        `To: ${input.activeDraft.to ?? "not yet provided"}`,
        "",
        input.activeDraft.body
      ].join("\n")
    : "ACTIVE DRAFT: none";

  const systemPrompt = [
    "Draft concise Gmail messages.",
    'Return JSON only: {"subject":"","body":""}',
    "Friendly professional tone.",
    "Subject <= 120 chars.",
    "No signature unless asked.",
    "RULES FOR DRAFT UPDATES:",
    "- If ACTIVE DRAFT is provided in context, you are updating that draft — not writing a new one.",
    "- Never shorten an existing approved draft body.",
    "- Never replace a full email with a one-line stub.",
    "- When filling in details, keep every paragraph of the existing body intact.",
    "- Only replace [placeholder] tokens with real values.",
    "- The final email must be at least as long as the draft you received."
  ].join("\n");

  const userPrompt = [
    `Request: ${input.userPrompt}`,
    `To: ${input.recipientEmail}`,
    `Name: ${input.recipientName?.trim() || "Unknown"}`,
    `Context: ${input.extraContext?.trim() || "None"}`,
    activeDraftContext,
    "JSON:"
  ].join("\n");

  return { systemPrompt, userPrompt };
}

export function parseEmailWriterOutput(text: string): EmailWriterOutput | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    return null;
  }

  const subject = asText(parsed.subject);
  const body = asText(parsed.body);
  if (!subject || !body) {
    return null;
  }

  return { subject, body };
}
