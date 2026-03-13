"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, ThumbsDown, ThumbsUp } from "lucide-react";

import type { Feedback } from "@/src/types/chat";
import styles from "@/src/styles/human-touch.module.css";

export function MessageActions(input: {
  visible: boolean;
  feedback: Feedback;
  onCopy: () => void;
  onUpvote: () => void;
  onDownvote: () => void;
}) {
  return (
    <AnimatePresence>
      {input.visible ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={styles.actions}
        >
          <button className={styles.actionBtn} onClick={input.onCopy} title="Copy">
            <Copy size={16} />
          </button>
          <button
            className={`${styles.actionBtn} ${input.feedback === "up" ? styles.actionActive : ""}`}
            onClick={input.onUpvote}
            title="Thumbs up"
          >
            <ThumbsUp size={16} />
          </button>
          <button
            className={`${styles.actionBtn} ${input.feedback === "down" ? styles.actionActive : ""}`}
            onClick={input.onDownvote}
            title="Thumbs down"
          >
            <ThumbsDown size={16} />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
