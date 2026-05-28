"use client";

import { useEffect, useRef } from "react";

type LiveStageAmbientBleedProps = {
  thumbnailUrl?: string | null;
  /** When true, mirror the sharp stage video into a blurred full-stage canvas. */
  mirrorLiveVideo?: boolean;
  energyScore?: number;
};

/**
 * Full-stage ambient layer — blurred thumbnail and/or live video mirror.
 * Sits behind the centered 9:16 plate; does not alter video dimensions.
 */
export function LiveStageAmbientBleed({
  thumbnailUrl,
  mirrorLiveVideo = true,
  energyScore = 0,
}: LiveStageAmbientBleedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumb = thumbnailUrl?.trim();

  useEffect(() => {
    if (!mirrorLiveVideo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastDraw = 0;
    const intervalMs = 1000 / 12;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(parent.clientWidth * dpr);
      canvas.height = Math.floor(parent.clientHeight * dpr);
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const parent = canvas.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < intervalMs) return;
      lastDraw = now;

      const video = document.querySelector<HTMLVideoElement>('video[data-live-stage-video="true"]');
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      canvas.classList.add("live-stage-ambient-canvas-visible");

      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w <= 0 || h <= 0) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.max(w / vw, h / vh) * 1.15;
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, dx, dy, dw, dh);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mirrorLiveVideo]);

  const energyOpacity = 0.32 + (Math.min(100, energyScore) / 100) * 0.18;

  return (
    <div className="live-stage-ambient-bleed pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {thumb ? (
        <div
          className="absolute inset-0 scale-[1.2] bg-cover bg-center motion-safe:transition-opacity duration-700"
          style={{
            backgroundImage: `url(${thumb})`,
            opacity: energyOpacity,
            filter: "blur(56px) saturate(1.35) brightness(0.55)",
          }}
        />
      ) : null}
      {mirrorLiveVideo ? (
        <canvas
          ref={canvasRef}
          className="live-stage-ambient-canvas absolute inset-0 size-full opacity-0 [filter:blur(64px)_saturate(1.4)_brightness(0.5)]"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65" />
      <div
        className="live-stage-ambient-glow absolute inset-x-0 bottom-0 h-[55%]"
        style={{ opacity: 0.2 + (Math.min(100, energyScore) / 100) * 0.5 }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_45%,transparent_0%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
