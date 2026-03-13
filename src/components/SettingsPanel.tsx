"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, Info, Keyboard, X } from "lucide-react";

import { BRANDING } from "@/src/config/branding.js";
import type { DensityMode, FontSizeMode, ThemeMode } from "@/src/config/theme";
import styles from "@/src/styles/human-touch.module.css";

function Segment<T extends string>(input: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
}) {
  return (
    <div className={styles.segment}>
      {input.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${styles.segmentButton} ${
            input.value === option.value ? styles.segmentButtonActive : ""
          }`}
          onClick={() => input.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle(input: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{input.label}</span>
      <button
        type="button"
        className={`${styles.toggle} ${input.checked ? styles.toggleOn : ""}`}
        onClick={() => input.onChange(!input.checked)}
        role="switch"
        aria-checked={input.checked}
        aria-label={input.label}
      >
        <span className={styles.toggleThumb} />
      </button>
    </div>
  );
}

export function SettingsPanel(input: {
  open: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (value: ThemeMode) => void;
  fontSizeMode: FontSizeMode;
  onFontSizeModeChange: (value: FontSizeMode) => void;
  densityMode: DensityMode;
  onDensityModeChange: (value: DensityMode) => void;
  showTypingIndicator: boolean;
  onShowTypingIndicatorChange: (next: boolean) => void;
  autoScroll: boolean;
  onAutoScrollChange: (next: boolean) => void;
  soundOnMessage: boolean;
  onSoundOnMessageChange: (next: boolean) => void;
  enterToSend: boolean;
  onEnterToSendChange: (next: boolean) => void;
  onExportConversation: () => void;
}) {
  const shortcuts = [
    { combo: "Ctrl/Cmd+K", hint: "Focus input" },
    { combo: "Ctrl/Cmd+N", hint: "New chat" },
    { combo: "Ctrl/Cmd+,", hint: "Open settings" },
    { combo: "Escape", hint: "Close settings" }
  ];

  return (
    <AnimatePresence>
      {input.open ? (
        <>
          <motion.button
            type="button"
            className={styles.overlay}
            onClick={input.onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label="Close settings"
          />
          <motion.aside
            className={`${styles.settingsPanel} ${styles.chrome}`}
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
          >
            <div className={styles.settingsHead}>
              <h2 className={styles.settingsTitle}>Settings</h2>
              <button type="button" className={styles.iconButton} onClick={input.onClose}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.settingsBody}>
              <section>
                <div className={styles.sectionLabel}>Appearance</div>
                <Segment
                  value={input.themeMode}
                  onChange={input.onThemeModeChange}
                  options={[
                    { label: "Dark", value: "dark" },
                    { label: "Light", value: "light" },
                    { label: "System", value: "system" }
                  ]}
                />
                <div style={{ height: 10 }} />
                <Segment
                  value={input.fontSizeMode}
                  onChange={input.onFontSizeModeChange}
                  options={[
                    { label: "Small", value: "small" },
                    { label: "Medium", value: "medium" },
                    { label: "Large", value: "large" }
                  ]}
                />
                <div style={{ height: 10 }} />
                <Segment
                  value={input.densityMode}
                  onChange={input.onDensityModeChange}
                  options={[
                    { label: "Comfortable", value: "comfortable" },
                    { label: "Compact", value: "compact" }
                  ]}
                />
              </section>

              <section>
                <div className={styles.sectionLabel}>Chat Behavior</div>
                <Toggle
                  label="Show typing indicator"
                  checked={input.showTypingIndicator}
                  onChange={input.onShowTypingIndicatorChange}
                />
                <Toggle
                  label="Auto-scroll to bottom"
                  checked={input.autoScroll}
                  onChange={input.onAutoScrollChange}
                />
                <Toggle
                  label="Sound on message"
                  checked={input.soundOnMessage}
                  onChange={input.onSoundOnMessageChange}
                />
                <Toggle
                  label="Enter to send"
                  checked={input.enterToSend}
                  onChange={input.onEnterToSendChange}
                />
              </section>

              <section>
                <div className={styles.sectionLabel}>Export</div>
                <div className={styles.settingsCard}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardIcon}>
                      <Download size={14} />
                    </span>
                    <div>
                      <div className={styles.cardTitle}>Conversation Transcript</div>
                      <div className={styles.cardDescription}>
                        Download this chat as a clean text transcript.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.exportButton}
                    onClick={input.onExportConversation}
                  >
                    Export conversation
                  </button>
                </div>
              </section>

              <section>
                <div className={styles.sectionLabel}>About</div>
                <div className={styles.aboutCard}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardIcon}>
                      <Info size={14} />
                    </span>
                    <div>
                      <div className={styles.aboutName}>{BRANDING.appName}</div>
                      <div className={styles.aboutTagline}>{BRANDING.tagline}</div>
                    </div>
                  </div>
                  <div className={styles.aboutDivider} />
                  <div className={styles.aboutText}>Powered by your own backend</div>
                  <div className={styles.aboutVersion}>Version 1.0.0</div>
                </div>
              </section>
            </div>

            <div className={styles.settingsFooter}>
              <div className={styles.shortcutsCard}>
                <div className={styles.shortcutsHead}>
                  <Keyboard size={14} />
                  <span>Shortcuts</span>
                </div>
                {shortcuts.map((item) => (
                  <div key={item.combo} className={styles.shortcutRow}>
                    <kbd className={styles.shortcutKey}>{item.combo}</kbd>
                    <span className={styles.shortcutHint}>{item.hint}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
