"use client";

import { BRANDING } from "@/src/config/branding.js";
import styles from "@/src/styles/human-touch.module.css";

export function ThinkingIndicator() {
  return (
    <div className={styles.thinkingWrap}>
      <span className={styles.assistantAvatar}>{BRANDING.logoFallbackInitial}</span>
      <span className={styles.dots} aria-label="Thinking">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
    </div>
  );
}
