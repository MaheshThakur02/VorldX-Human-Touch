"use client";

import { BRANDING } from "@/src/config/branding.js";
import { MarkdownRenderer } from "@/src/components/MarkdownRenderer";
import styles from "@/src/styles/human-touch.module.css";

export function AIMessage(input: {
  content: string;
  isStreaming: boolean;
  isError?: boolean;
}) {
  if (input.isError) {
    return (
      <div className={styles.assistantWrap}>
        <span className={styles.assistantAvatar}>{BRANDING.logoFallbackInitial}</span>
        <div className={styles.errorMessage}>
          <span className={styles.errorIcon} aria-hidden="true">
            ⚠
          </span>
          <span>{input.content || "Something went wrong."}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.assistantWrap}>
      <span className={styles.assistantAvatar}>{BRANDING.logoFallbackInitial}</span>
      <div className={styles.assistantContent}>
        <MarkdownRenderer content={input.content || (input.isStreaming ? "" : " ")} />
        {input.isStreaming ? <span className={styles.cursor}>|</span> : null}
      </div>
    </div>
  );
}
