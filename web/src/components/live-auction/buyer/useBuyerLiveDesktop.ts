"use client";

import { useLayoutEffect, useState } from "react";

/** Desktop buyer 30/50/20 grid — active at 1280px and up. */
export const BUYER_LIVE_DESKTOP_MIN_WIDTH_PX = 1280;

export function useBuyerLiveDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia(`(min-width: ${BUYER_LIVE_DESKTOP_MIN_WIDTH_PX}px)`);
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return desktop;
}
