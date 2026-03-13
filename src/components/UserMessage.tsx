"use client";

import { motion } from "framer-motion";

import styles from "@/src/styles/human-touch.module.css";

export function UserMessage(input: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={styles.userWrap}
    >
      <div className={styles.userBubble}>{input.content}</div>
    </motion.div>
  );
}
