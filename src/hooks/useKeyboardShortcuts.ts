import { useEffect } from "react";

interface ShortcutHandlers {
  focusInput: () => void;
  newChat: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  clearInput: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;

      if (mod && key === "k") {
        event.preventDefault();
        handlers.focusInput();
        return;
      }
      if (mod && key === "n") {
        event.preventDefault();
        handlers.newChat();
        return;
      }
      if (mod && key === ",") {
        event.preventDefault();
        handlers.openSettings();
        return;
      }
      if (key === "escape") {
        handlers.closeSettings();
        handlers.clearInput();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
