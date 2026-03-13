import { useEffect, type RefObject } from "react";

export function useAutoScroll(input: {
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  trigger: unknown;
}) {
  useEffect(() => {
    if (!input.enabled) return;
    const node = input.containerRef.current;
    if (!node) return;
    const raf = requestAnimationFrame(() => {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: "smooth"
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [input.containerRef, input.enabled, input.trigger]);
}
