"use client";

import { useEffect, type PropsWithChildren } from "react";

function isEditableElement(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest("[data-keyboard-dismiss-ignore]")) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

/** Blurs focused inputs when the user taps or clicks outside editable fields. */
export function KeyboardDismissProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const dismissIfOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (isEditableElement(target)) return;

      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      if (!isEditableElement(active)) return;
      active.blur();
    };

    document.addEventListener("mousedown", dismissIfOutside);
    document.addEventListener("touchstart", dismissIfOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", dismissIfOutside);
      document.removeEventListener("touchstart", dismissIfOutside);
    };
  }, []);

  return children;
}
