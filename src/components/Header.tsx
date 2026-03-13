"use client";
/* eslint-disable @next/next/no-img-element */

import { Settings, SquarePen } from "lucide-react";
import { useState } from "react";

import { BRANDING } from "@/src/config/branding.js";
import styles from "@/src/styles/human-touch.module.css";

type ControlMode = "MINDSTORM" | "DIRECTION";

export function Header(input: {
  onOpenSettings: () => void;
  onNewChat: () => void;
  mode: ControlMode;
  onModeChange: (mode: ControlMode) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className={`${styles.header} ${styles.chrome}`}>
      <div className={styles.headerLeft}>
        {!logoFailed ? (
          <img
            src={BRANDING.logoPath}
            alt={BRANDING.appName}
            className={styles.logo}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className={styles.logoFallback}>{BRANDING.logoFallbackInitial}</span>
        )}
        <span className={styles.appName}>{BRANDING.appName}</span>
      </div>

      <div className={`${styles.modeTabs} ${styles.chrome}`}>
        <button
          type="button"
          className={`${styles.modeTabButton} ${
            input.mode === "MINDSTORM" ? styles.modeTabButtonActive : ""
          }`}
          onClick={() => input.onModeChange("MINDSTORM")}
        >
          Brainstorming
        </button>
        <button
          type="button"
          className={`${styles.modeTabButton} ${
            input.mode === "DIRECTION" ? styles.modeTabButtonActive : ""
          }`}
          onClick={() => input.onModeChange("DIRECTION")}
        >
          Direction
        </button>
      </div>

      <div className={styles.headerRight}>
        <button className={styles.iconButton} onClick={input.onOpenSettings} title="Settings">
          <Settings size={18} />
        </button>
        <button className={styles.iconButton} onClick={input.onNewChat} title="New chat">
          <SquarePen size={18} />
        </button>
      </div>
    </header>
  );
}
