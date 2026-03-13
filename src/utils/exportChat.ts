import type { ChatMessage } from "@/src/types/chat";
import { BRANDING } from "@/src/config/branding.js";

function formatDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}-${String(d.getMinutes()).padStart(2, "0")}`;
}

export function exportChatTranscript(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  const lines = messages.map((msg) => {
    const role = msg.role === "user" ? "You" : BRANDING.appName;
    return `[${role}] ${msg.content}`;
  });
  const body = lines.join("\n\n");
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `humtouch-chat-${formatDate(Date.now())}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
