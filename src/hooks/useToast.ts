import { useCallback, useMemo, useRef, useState } from "react";

import type { ToastItem } from "@/src/types/chat";

function toastId() {
  return `toast_${Math.random().toString(36).slice(2, 10)}`;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (text: string) => {
      const id = toastId();
      setToasts((prev) => [...prev, { id, text }]);
      const timeout = setTimeout(() => dismiss(id), 2500);
      timers.current.set(id, timeout);
    },
    [dismiss]
  );

  return useMemo(
    () => ({
      toasts,
      push,
      dismiss
    }),
    [dismiss, push, toasts]
  );
}
