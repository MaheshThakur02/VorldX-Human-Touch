"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/src/components/EmptyState";
import { Header } from "@/src/components/Header";
import { InputBox } from "@/src/components/InputBox";
import { MessageList } from "@/src/components/MessageList";
import { SettingsPanel } from "@/src/components/SettingsPanel";
import { StopButton } from "@/src/components/StopButton";
import { ToastStack } from "@/src/components/Toast";
import { useChat } from "@/src/hooks/useChat";
import { useKeyboardShortcuts } from "@/src/hooks/useKeyboardShortcuts";
import { useTheme } from "@/src/hooks/useTheme";
import { useToast } from "@/src/hooks/useToast";
import styles from "@/src/styles/human-touch.module.css";
import { exportChatTranscript } from "@/src/utils/exportChat";
import { playSoftChime } from "@/src/utils/sound";

type ControlMode = "MINDSTORM" | "DIRECTION";
type AppShellTheme = "APEX" | "VEDA" | "NEXUS";

function readBoolPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function HumanTouchApp(input: {
  mode?: ControlMode;
  onModeChange?: (mode: ControlMode) => void;
  onUserMessage?: (text: string, mode: ControlMode) => Promise<void> | void;
  onStopGeneration?: (mode: ControlMode) => void;
  appTheme?: AppShellTheme;
} = {}) {
  const externalOnModeChange = input.onModeChange;
  const externalOnUserMessage = input.onUserMessage;
  const externalOnStopGeneration = input.onStopGeneration;
  const [composer, setComposer] = useState("");
  const [localMode, setLocalMode] = useState<ControlMode>(input.mode ?? "MINDSTORM");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [soundOnMessage, setSoundOnMessage] = useState(false);
  const [enterToSend, setEnterToSend] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { toasts, push } = useToast();
  const mode = input.mode ?? localMode;
  const {
    messages,
    sendUserMessage,
    stopGeneration,
    clearConversation,
    copyMessage,
    updateFeedback,
    isResponding,
    isWaitingFirstToken
  } = useChat({
    onToast: push,
    onPlaySound: playSoftChime,
    soundEnabled: soundOnMessage,
    onUserMessage: (text) => externalOnUserMessage?.(text, mode),
    onStopGeneration: () => externalOnStopGeneration?.(mode)
  });

  const {
    themeMode,
    setThemeMode,
    fontSizeMode,
    setFontSizeMode,
    densityMode,
    setDensityMode,
    cssVars
  } = useTheme({ appTheme: input.appTheme ?? "NEXUS" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowTypingIndicator(readBoolPreference("humtouch_show_typing_indicator", true));
    setAutoScroll(readBoolPreference("humtouch_auto_scroll", true));
    setSoundOnMessage(readBoolPreference("humtouch_sound_on_message", false));
    setEnterToSend(readBoolPreference("humtouch_enter_to_send", true));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("humtouch_show_typing_indicator", String(showTypingIndicator));
    window.localStorage.setItem("humtouch_auto_scroll", String(autoScroll));
    window.localStorage.setItem("humtouch_sound_on_message", String(soundOnMessage));
    window.localStorage.setItem("humtouch_enter_to_send", String(enterToSend));
  }, [autoScroll, enterToSend, showTypingIndicator, soundOnMessage]);

  useEffect(() => {
    if (input.mode) {
      setLocalMode(input.mode);
    }
  }, [input.mode]);

  const handleSend = useCallback(() => {
    const text = composer.trim();
    if (!text || isResponding) return;
    sendUserMessage(text);
    setComposer("");
  }, [composer, isResponding, sendUserMessage]);

  const handleClearInput = useCallback(() => {
    if (isResponding) return;
    setComposer("");
  }, [isResponding]);

  const handleNewChat = useCallback(() => {
    clearConversation();
    setComposer("");
  }, [clearConversation]);

  const handleExport = useCallback(() => {
    exportChatTranscript(messages);
    push("Chat exported");
  }, [messages, push]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useKeyboardShortcuts({
    focusInput,
    newChat: handleNewChat,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    clearInput: handleClearInput
  });

  const handleModeChange = useCallback((nextMode: ControlMode) => {
    if (externalOnModeChange) {
      externalOnModeChange(nextMode);
      return;
    }
    setLocalMode(nextMode);
  }, [externalOnModeChange]);

  return (
    <div className={styles.shell} style={cssVars}>
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onNewChat={handleNewChat}
        mode={mode}
        onModeChange={handleModeChange}
      />

      {messages.length === 0 ? (
        <div className={styles.messageViewport}>
          <div className={styles.messageColumnWrap}>
            <EmptyState
              onPickSuggestion={(value) => {
                setComposer(value);
                focusInput();
              }}
            />
          </div>
        </div>
      ) : (
        <MessageList
          messages={messages}
          autoScroll={autoScroll}
          isWaitingFirstToken={showTypingIndicator ? isWaitingFirstToken : false}
          onCopyMessage={copyMessage}
          onFeedback={updateFeedback}
        />
      )}

      <div>
        <StopButton
          visible={isResponding}
          onStop={() => {
            stopGeneration();
          }}
        />
        <InputBox
          value={composer}
          onChange={setComposer}
          onSend={handleSend}
          onClear={handleClearInput}
          onAttach={() => push("Attach file")}
          isResponding={isResponding}
          enterToSend={enterToSend}
          textareaRef={inputRef}
        />
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        fontSizeMode={fontSizeMode}
        onFontSizeModeChange={setFontSizeMode}
        densityMode={densityMode}
        onDensityModeChange={setDensityMode}
        showTypingIndicator={showTypingIndicator}
        onShowTypingIndicatorChange={setShowTypingIndicator}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        soundOnMessage={soundOnMessage}
        onSoundOnMessageChange={setSoundOnMessage}
        enterToSend={enterToSend}
        onEnterToSendChange={setEnterToSend}
        onExportConversation={handleExport}
      />

      <ToastStack toasts={toasts} />
    </div>
  );
}
