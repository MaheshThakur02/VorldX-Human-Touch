"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Square } from "lucide-react";

import styles from "@/src/styles/human-touch.module.css";

export function StopButton(input: {
  visible: boolean;
  onStop: () => void;
}) {
  return (
    <AnimatePresence>
      {input.visible ? (
        <motion.div
          className={styles.stopWrap}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <button type="button" className={styles.stopButton} onClick={input.onStop}>
            <Square size={13} />
            Stop generating
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
