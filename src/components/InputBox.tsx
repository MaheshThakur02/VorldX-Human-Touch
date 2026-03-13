"use client";

import { ArrowUp, Paperclip } from "lucide-react";
import { useEffect, type KeyboardEvent, type RefObject } from "react";

import { BRANDING } from "@/src/config/branding.js";
import styles from "@/src/styles/human-touch.module.css";

export function InputBox(input: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
  onAttach: () => void;
  isResponding: boolean;
  enterToSend: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
}) {
  useEffect(() => {
    const node = input.textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    const nextHeight = Math.min(node.scrollHeight, 160);
    node.style.height = `${nextHeight}px`;
    node.style.overflowY = node.scrollHeight > 160 ? "auto" : "hidden";
  }, [input.textareaRef, input.value]);

  const canSend = input.value.trim().length > 0 && !input.isResponding;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && input.enterToSend) {
      event.preventDefault();
      if (canSend) {
        input.onSend();
      }
      return;
    }
    if (event.key === "Escape" && !input.isResponding) {
      event.preventDefault();
      input.onClear();
    }
  };

  return (
    <div className={styles.inputRegion}>
      <div className={styles.inputWrap}>
        <textarea
          ref={input.textareaRef}
          className={styles.textarea}
          value={input.value}
          onChange={(event) => input.onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${BRANDING.appName}...`}
          rows={1}
          aria-label="Message input"
        />
        <div className={styles.inputBottom}>
          <button
            type="button"
            className={styles.attachButton}
            onClick={input.onAttach}
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip size={18} />
          </button>
          <div className={styles.rightControls}>
            {input.value.length > 200 ? (
              <span className={styles.count}>{input.value.length}</span>
            ) : null}
            <button
              type="button"
              className={`${styles.sendButton} ${
                canSend ? styles.sendButtonActive : styles.sendButtonDisabled
              }`}
              disabled={!canSend}
              onClick={input.onSend}
              aria-label="Send message"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
