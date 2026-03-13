export type EmailDraftIntent =
  | "birthday_wish"
  | "wedding_congrats"
  | "promotion_congrats"
  | "new_role_congrats"
  | "thank_you"
  | "meeting_share"
  | "generic_note";

export interface IntentEmailDraftInput {
  message: string;
  recipientEmail?: string | null;
  recipientName?: string | null;
  companyName?: string | null;
  senderName?: string | null;
  intentHint?: string | null;
}

export interface IntentEmailDraftOutput {
  subject: string;
  body: string;
  intentHint: EmailDraftIntent;
  recipientName: string | null;
  senderName: string | null;
}

const PERSON_NAME_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "birthday",
  "body",
  "cc",
  "compose",
  "content",
  "create",
  "draft",
  "email",
  "for",
  "from",
  "generate",
  "gmail",
  "his",
  "her",
  "mail",
  "message",
  "new",
  "of",
  "on",
  "promotion",
  "regarding",
  "role",
  "send",
  "subject",
  "that",
  "the",
  "to",
  "wish",
  "write"
]);

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCaseName(value: string) {
  return normalizeWhitespace(value)
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ""))
    .join(" ")
    .trim();
}

function isLikelyHumanName(candidate: string) {
  const words = normalizeWhitespace(candidate).split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 4) {
    return false;
  }
  if (words.some((word) => PERSON_NAME_STOPWORDS.has(word.toLowerCase()))) {
    return false;
  }
  return words.every((word) => /^[a-z][a-z'-]{1,23}$/i.test(word));
}

function cleanNameCandidate(candidate: string) {
  const trimmed = normalizeWhitespace(candidate.replace(/^[,.\-:;]+|[,.\-:;]+$/g, ""));
  if (!trimmed) return "";
  if (!isLikelyHumanName(trimmed)) return "";
  return titleCaseName(trimmed);
}

function inferNameFromEmail(email: string) {
  const normalized = asText(email).toLowerCase();
  if (!normalized.includes("@")) {
    return "";
  }
  const localPart = normalized.split("@")[0] ?? "";
  const sanitized = localPart.replace(/[0-9_.-]+/g, " ").trim();
  const candidate = cleanNameCandidate(sanitized);
  if (!candidate) {
    const firstToken = cleanNameCandidate((localPart.match(/[a-z]+/i)?.[0] ?? "").trim());
    return firstToken;
  }
  return candidate;
}

export function inferRecipientNameFromMessage(message: string) {
  const normalized = normalizeWhitespace(message);
  if (!normalized) return "";

  const explicitPatterns = [
    /\b(?:name is|named)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+){0,2})/i,
    /\b(?:to|for)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+){0,2})(?=\s+\b(?:at|on|regarding|about|subject|body|message|content)\b|[.,!?]|$)/i,
    /\b(?:brother|sister|friend|colleague|manager|boss|wife|husband)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+){0,2})/i
  ];

  for (const pattern of explicitPatterns) {
    const matched = cleanNameCandidate(asText(normalized.match(pattern)?.[1]));
    if (matched) {
      return matched;
    }
  }

  return "";
}

export function inferSenderNameFromMessage(message: string) {
  const normalized = normalizeWhitespace(message);
  if (!normalized) return "";

  const patterns = [
    /\bmy name is\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+){0,2})/i,
    /\b(?:i am|i'm|this is)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+){0,2})/i,
    /\bfrom\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+){0,2})/i
  ];

  for (const pattern of patterns) {
    const matched = cleanNameCandidate(asText(normalized.match(pattern)?.[1]));
    if (matched) {
      return matched;
    }
  }

  return "";
}

export function isResendRequestMessage(message: string) {
  return /\b(resend|send again|send it again|send that again)\b/i.test(message);
}

export function isDraftRegenerationRequest(message: string) {
  return /\b(regenerate|rewrite|redo|start over|fresh draft|draft again)\b/i.test(message) &&
    /\b(draft|email|mail)\b/i.test(message)
    ? true
    : /\b(wrong|incorrect|bad draft|not right)\b/i.test(message);
}

function extractMeetingLink(message: string) {
  return (
    message.match(
      /https?:\/\/(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|calendar\.google\.com)\/[^\s)]+/i
    )?.[0] ?? ""
  ).trim();
}

function inferIntent(message: string, hint: string) {
  const normalized = message.toLowerCase();
  const combined = `${normalized} ${hint.toLowerCase()}`.trim();

  if (/\b(birthday|bday|happy birthday)\b/.test(combined)) {
    return "birthday_wish" as const;
  }
  if (/\b(wedding|marriage)\b/.test(combined)) {
    return "wedding_congrats" as const;
  }
  if (/\b(promotion|promoted)\b/.test(combined)) {
    return "promotion_congrats" as const;
  }
  if (/\b(new role|new job|new position|congrat|congrats|congratulations)\b/.test(combined)) {
    return "new_role_congrats" as const;
  }
  if (/\b(thank you|thanks|grateful|appreciate)\b/.test(combined)) {
    return "thank_you" as const;
  }
  if (/\b(meeting|invite|calendar|join link|zoom|google meet)\b/.test(combined)) {
    return "meeting_share" as const;
  }
  return "generic_note" as const;
}

function withSignoff(lines: string[], senderName: string | null) {
  const output = [...lines, "", "Best regards,"];
  if (senderName) {
    output.push(senderName);
  }
  return output.join("\n");
}

export function generateIntentEmailDraft(input: IntentEmailDraftInput): IntentEmailDraftOutput {
  const message = asText(input.message);
  const recipientEmail = asText(input.recipientEmail);
  const inferredRecipient = inferRecipientNameFromMessage(message);
  const recipientName =
    cleanNameCandidate(asText(input.recipientName)) ||
    inferredRecipient ||
    inferNameFromEmail(recipientEmail) ||
    null;
  const senderName =
    cleanNameCandidate(asText(input.senderName)) ||
    inferSenderNameFromMessage(message) ||
    null;
  const companyName = asText(input.companyName) || null;
  const intentHint = asText(input.intentHint);
  const intent = inferIntent(message, intentHint);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const meetingLink = extractMeetingLink(message);

  if (intent === "birthday_wish") {
    return {
      subject: recipientName ? `Happy Birthday, ${recipientName}!` : "Happy Birthday!",
      body: withSignoff(
        [
          greeting,
          "",
          "Wishing you a very happy birthday!",
          "May your day be filled with joy, good health, and great memories.",
          "Hope the year ahead brings you success and happiness."
        ],
        senderName
      ),
      intentHint: intent,
      recipientName,
      senderName
    };
  }

  if (intent === "wedding_congrats") {
    return {
      subject: "Congratulations on Your Wedding",
      body: withSignoff(
        [
          greeting,
          "",
          "Congratulations on your wedding!",
          "Wishing you both a lifetime of love, happiness, and beautiful moments together."
        ],
        senderName
      ),
      intentHint: intent,
      recipientName,
      senderName
    };
  }

  if (intent === "promotion_congrats" || intent === "new_role_congrats") {
    const roleLine =
      intent === "promotion_congrats"
        ? "Congratulations on your promotion!"
        : "Congratulations on your new role!";
    const companyLine = companyName ? `This is a great milestone, especially at ${companyName}.` : "";
    return {
      subject: intent === "promotion_congrats" ? "Congratulations on Your Promotion" : "Congratulations on Your New Role",
      body: withSignoff(
        [greeting, "", roleLine, companyLine, "Wishing you continued success in this new chapter."].filter(
          Boolean
        ),
        senderName
      ),
      intentHint: intent,
      recipientName,
      senderName
    };
  }

  if (intent === "thank_you") {
    return {
      subject: "Thank You",
      body: withSignoff(
        [
          greeting,
          "",
          "Thank you for your support and effort.",
          "I really appreciate your time and contribution."
        ],
        senderName
      ),
      intentHint: intent,
      recipientName,
      senderName
    };
  }

  if (intent === "meeting_share") {
    return {
      subject: "Meeting Details",
      body: withSignoff(
        [
          greeting,
          "",
          "Sharing the meeting details below.",
          meetingLink ? `Meeting link: ${meetingLink}` : "Please find the meeting details attached.",
          "Let me know if you need any changes."
        ],
        senderName
      ),
      intentHint: intent,
      recipientName,
      senderName
    };
  }

  return {
    subject: "Quick Note",
    body: withSignoff(
      [
        greeting,
        "",
        "Hope you are doing well.",
        "Wanted to send you a quick note and stay in touch."
      ],
      senderName
    ),
    intentHint: intent,
    recipientName,
    senderName
  };
}
