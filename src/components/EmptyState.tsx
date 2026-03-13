"use client";
/* eslint-disable @next/next/no-img-element */

import { motion } from "framer-motion";

import { BRANDING } from "@/src/config/branding.js";
import styles from "@/src/styles/human-touch.module.css";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

export function EmptyState(input: {
  onPickSuggestion: (value: string) => void;
}) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={styles.emptyState}
    >
      <motion.h2 variants={item} className={styles.emptyTitle}>
        {BRANDING.welcomeMessage}
      </motion.h2>
      <motion.p variants={item} className={`${styles.emptySubtext} ${styles.chrome}`}>
        {BRANDING.welcomeSubtext}
      </motion.p>
      <motion.div variants={item} className={styles.chips}>
        {BRANDING.suggestionChips.map((chip) => (
          <button
            key={chip}
            className={styles.chip}
            onClick={() => input.onPickSuggestion(chip)}
          >
            {chip}
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
}
