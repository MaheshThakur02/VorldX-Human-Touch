export type Role = "user" | "assistant";
export type Feedback = "up" | "down" | null;

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  feedback: Feedback;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ToastItem {
  id: string;
  text: string;
}

declare global {
  interface Window {
    sendMessageToUI?: (token: string) => void;
    completeMessageToUI?: () => void;
    showErrorInUI?: (message: string) => void;
    onUserMessage?: (text: string) => void;
    onStopGeneration?: () => void;
  }
}

export {};
