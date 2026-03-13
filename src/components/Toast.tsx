"use client";

import { AnimatePresence, motion } from "framer-motion";

import type { ToastItem } from "@/src/types/chat";
import styles from "@/src/styles/human-touch.module.css";

export function ToastStack(input: { toasts: ToastItem[] }) {
  return (
    <div className={styles.toasts}>
      <AnimatePresence>
        {input.toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`${styles.toast} ${styles.chrome}`}
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
