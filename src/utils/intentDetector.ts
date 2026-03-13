export type UserIntent = "DRAFT" | "SEND" | "GENERAL";

const DRAFT_KEYWORDS = ["draft", "write", "compose", "create", "make", "generate"];
const SEND_KEYWORDS = ["send", "email to", "submit", "deliver"];

export function detectIntent(text: string): UserIntent {
  const lower = text.toLowerCase();

  if (DRAFT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "DRAFT";
  }
  if (SEND_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "SEND";
  }
  return "GENERAL";
}

export function enrichMessageForIntent(text: string) {
  const intent = detectIntent(text);
  if (intent === "DRAFT") {
    return {
      intent,
      message: `[USER WANTS A DRAFT - write it immediately, do not ask for fields]\n${text}`
    };
  }
  return {
    intent,
    message: text
  };
}
