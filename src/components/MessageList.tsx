"use client";

import { useRef } from "react";

import { Message } from "@/src/components/Message";
import { ThinkingIndicator } from "@/src/components/ThinkingIndicator";
import { useAutoScroll } from "@/src/hooks/useAutoScroll";
import type { ChatMessage, Feedback } from "@/src/types/chat";
import styles from "@/src/styles/human-touch.module.css";

export function MessageList(input: {
  messages: ChatMessage[];
  autoScroll: boolean;
  isWaitingFirstToken: boolean;
  onCopyMessage: (id: string) => void;
  onFeedback: (id: string, feedback: Feedback) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useAutoScroll({
    containerRef: ref,
    enabled: input.autoScroll,
    trigger: `${input.messages.length}:${input.messages[input.messages.length - 1]?.content ?? ""}:${input.isWaitingFirstToken}`
  });

  return (
    <div className={styles.messageViewport}>
      <div className={styles.messageColumnWrap}>
        <div ref={ref} className={styles.messageList}>
          {input.messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              onCopy={input.onCopyMessage}
              onFeedback={input.onFeedback}
            />
          ))}
          {input.isWaitingFirstToken ? <ThinkingIndicator /> : null}
        </div>
      </div>
    </div>
  );
}
