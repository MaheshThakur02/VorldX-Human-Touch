function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function collectObjectCandidates(
  value: unknown,
  out: Record<string, unknown>[],
  depth = 0
) {
  if (depth > 4 || value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectCandidates(item, out, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  out.push(record);
  for (const nested of Object.values(record)) {
    collectObjectCandidates(nested, out, depth + 1);
  }
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "ok", "success", "sent"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function normalizePotentialMessageId(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  if (text.length < 10) return "";
  if (/^(conn_|log_|task_|run_|ac_|ca_|tool_|ui_|req_|evt_|flow_|org_|user_)/i.test(text)) {
    return "";
  }
  return text;
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeBodyForCompare(value: string) {
  return normalizeComparableText(value).replace(/[^a-z0-9\s]/gi, "");
}

function parseReceivedAtMs(value: unknown) {
  const text = asText(value);
  if (!text) return null;
  if (/^\d{13}$/.test(text)) {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^\d{10}$/.test(text)) {
    const parsed = Number(text) * 1000;
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasGmailMessageShape(candidate: Record<string, unknown>) {
  for (const key of [
    "threadId",
    "thread_id",
    "labelIds",
    "label_ids",
    "internalDate",
    "internal_date",
    "snippet",
    "historyId",
    "history_id"
  ]) {
    if (candidate[key] !== undefined && candidate[key] !== null) {
      return true;
    }
  }
  return false;
}

export function extractSendReceipt(rawData: Record<string, unknown>) {
  const candidates: Record<string, unknown>[] = [];
  collectObjectCandidates(rawData, candidates);

  let messageId = "";
  let threadId = "";
  let acceptedByProvider = false;
  let providerStatus = "";

  for (const candidate of candidates) {
    if (!messageId) {
      messageId =
        normalizePotentialMessageId(candidate.messageId) ||
        normalizePotentialMessageId(candidate.message_id) ||
        normalizePotentialMessageId(candidate.gmailMessageId) ||
        normalizePotentialMessageId(candidate.gmail_message_id) ||
        (hasGmailMessageShape(candidate)
          ? normalizePotentialMessageId(candidate.id)
          : "");
    }

    if (!threadId) {
      threadId =
        normalizePotentialMessageId(candidate.threadId) ||
        normalizePotentialMessageId(candidate.thread_id);
    }

    for (const flagKey of [
      "sent",
      "success",
      "successful",
      "accepted",
      "queued",
      "ok",
      "delivered"
    ]) {
      const parsed = asBoolean(candidate[flagKey]);
      if (parsed === true) {
        acceptedByProvider = true;
      }
    }

    if (!providerStatus) {
      providerStatus =
        asText(candidate.status) ||
        asText(candidate.state) ||
        asText(candidate.result) ||
        asText(candidate.outcome);
    }
  }

  if (!acceptedByProvider && providerStatus) {
    acceptedByProvider = /\b(success|succeeded|accepted|queued|sent)\b/i.test(providerStatus);
  }
  if (!acceptedByProvider && messageId) {
    acceptedByProvider = true;
  }

  return {
    acceptedByProvider,
    deliveryVerified: Boolean(messageId),
    messageId: messageId || null,
    threadId: threadId || null,
    providerStatus: providerStatus || null
  };
}

export function findSentMailboxMatch<
  TEmail extends {
    to: string | null;
    subject: string | null;
    bodyText?: string | null;
    snippet?: string | null;
    receivedAt?: string | null;
  }
>(input: {
  to: string;
  subject: string;
  body?: string;
  sentAfterMs?: number;
  emails: TEmail[];
}) {
  const recipientNeedle = input.to.toLowerCase();
  const subjectNeedle = normalizeComparableText(input.subject);
  const bodyNeedle = normalizeBodyForCompare(asText(input.body)).slice(0, 80);
  const timeFloorMs =
    typeof input.sentAfterMs === "number" && Number.isFinite(input.sentAfterMs)
      ? Math.max(0, Math.floor(input.sentAfterMs) - 120_000)
      : null;
  return (
    input.emails.find((email) => {
      const to = asText(email.to).toLowerCase();
      if (!to || !to.includes(recipientNeedle)) {
        return false;
      }
      if (!subjectNeedle) {
        return true;
      }
      const subject = normalizeComparableText(asText(email.subject));
      if (!subject.includes(subjectNeedle)) {
        return false;
      }

      const bodyHaystack = normalizeBodyForCompare(
        `${asText(email.bodyText)} ${asText(email.snippet)}`
      );
      if (bodyNeedle && bodyHaystack && !bodyHaystack.includes(bodyNeedle)) {
        return false;
      }

      if (timeFloorMs !== null) {
        const receivedAtMs = parseReceivedAtMs(email.receivedAt);
        if (receivedAtMs !== null) {
          return receivedAtMs >= timeFloorMs;
        }
        if (!bodyNeedle) {
          return false;
        }
      }

      return true;
    }) ?? null
  );
}
