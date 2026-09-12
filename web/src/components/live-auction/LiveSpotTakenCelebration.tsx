"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatSpotCelebrationAccessibility,
  isSpotCelebrationViewerWinner,
  spotCelebrationDismissKey,
  spotCelebrationHeadline,
  spotCelebrationKicker,
  spotCelebrationTagline,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration,
} from "@/lib/live-spot-celebration";

type Props = {
  celebration: LiveSpotTakenCelebration | null;
  onDone: () => void;
  viewerUsername?: string | null;
};

const DISPLAY_MS = SPOT_CELEBRATION_DISPLAY_MS;

type Particle = {
  type: "spark" | "coin";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  rotSpeed?: number;
};

/** Real damped-spring integration — not an eyeballed CSS easing curve. */
function springTo(
  from: number,
  to: number,
  stiffness: number,
  damping: number,
  onUpdate: (value: number) => void,
  onDone?: () => void,
) {
  let value = from;
  let velocity = 0;
  let last = performance.now();
  function step(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const accel = -stiffness * (value - to) - damping * velocity;
    velocity += accel * dt;
    value += velocity * dt;
    onUpdate(value);
    if (Math.abs(value - to) > 0.002 || Math.abs(velocity) > 0.002) {
      requestAnimationFrame(step);
    } else {
      onUpdate(to);
      onDone?.();
    }
  }
  requestAnimationFrame(step);
}

function shakeElement(el: HTMLElement, duration: number, magnitude: number) {
  const start = performance.now();
  function frame(now: number) {
    const t = now - start;
    if (t > duration) {
      el.style.transform = "";
      return;
    }
    const decay = 1 - t / duration;
    const dx = (Math.random() * 2 - 1) * magnitude * decay;
    const dy = (Math.random() * 2 - 1) * magnitude * decay;
    el.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** Canvas particle burst — real gravity + per-particle randomization, so no two hits look the same. */
function burstParticles(canvas: HTMLCanvasElement, bounds: HTMLElement, reduceMotion: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = bounds.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height * 0.42;
  const particles: Particle[] = [];
  const sparkCount = reduceMotion ? 0 : 16;
  const coinCount = reduceMotion ? 0 : 9;

  for (let i = 0; i < sparkCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 100;
    particles.push({
      type: "spark",
      x: cx,
      y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0,
      maxLife: 0.35 + Math.random() * 0.25,
      size: 2 + Math.random() * 1.6,
      rot: a,
    });
  }
  for (let j = 0; j < coinCount; j++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
    const speed = 120 + Math.random() * 90;
    particles.push({
      type: "coin",
      x: cx,
      y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.5,
      size: 3.5 + Math.random() * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 10,
    });
  }

  const gravity = 260;
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    ctx!.clearRect(0, 0, rect.width, rect.height);
    let alive = false;
    particles.forEach((p) => {
      p.life += dt;
      if (p.life > p.maxLife) return;
      alive = true;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += (p.rotSpeed || 0) * dt;
      const t = p.life / p.maxLife;
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.globalAlpha = Math.max(0, 1 - t);
      if (p.type === "spark") {
        const grad = ctx!.createLinearGradient(0, -p.size * 2, 0, p.size * 2);
        grad.addColorStop(0, "#FFE9A8");
        grad.addColorStop(1, "#D4AF37");
        ctx!.fillStyle = grad;
        ctx!.fillRect(-p.size / 2, -p.size * 2, p.size, p.size * 4);
      } else {
        ctx!.fillStyle = "#D4AF37";
        ctx!.beginPath();
        ctx!.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = "rgba(255,246,221,0.85)";
        ctx!.beginPath();
        ctx!.ellipse(-p.size * 0.28, -p.size * 0.18, p.size * 0.32, p.size * 0.16, 0, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
    });
    if (alive) requestAnimationFrame(frame);
    else ctx!.clearRect(0, 0, rect.width, rect.height);
  }
  requestAnimationFrame(frame);
}

/** Impact thud + metallic clang + ascending sparkle chime, synthesized — no audio asset needed.
 * Autoplay policies can silently block this; it's wrapped so a block never breaks the celebration. */
function playImpactSound(ctxRef: { current: AudioContext | null }) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctxRef.current) ctxRef.current = new AC();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(170, now);
    thud.frequency.exponentialRampToValueAtTime(38, now + 0.24);
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.exponentialRampToValueAtTime(0.9, now + 0.01);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    thud.connect(thudGain).connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.32);

    const bufferSize = Math.floor(ctx.sampleRate * 0.28);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 2600;
    bandpass.Q.value = 1.3;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    noise.connect(bandpass).connect(noiseGain).connect(ctx.destination);
    noise.start(now + 0.005);
    noise.stop(now + 0.3);

    [880, 1174.66, 1567.98, 2093].forEach((freq, idx) => {
      const t0 = now + 0.2 + idx * 0.06;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.25);
    });
  } catch {
    // autoplay blocked or Web Audio unsupported — the celebration still works without sound
  }
}

/** PYT/PYD spot win — full-screen "Vault Strike" hype card with the claim gradient replaced by
 * on-brand gold: gavel strike, screen-kick, shockwave, spark/coin burst, and a synced impact sound,
 * all driven by real spring physics instead of canned CSS keyframes. No price, no CTA. */
export function LiveSpotTakenCelebration({ celebration, onDone, viewerUsername }: Props) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const onDoneRef = useRef(onDone);
  const shownAtRef = useRef<number | null>(null);

  const screenRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const shock1Ref = useRef<HTMLDivElement | null>(null);
  const shock2Ref = useRef<HTMLDivElement | null>(null);
  const hammerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const headlineRef = useRef<HTMLParagraphElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismissKey = celebration ? spotCelebrationDismissKey(celebration) : null;
  const viewerIsWinner = celebration ? isSpotCelebrationViewerWinner(celebration, viewerUsername) : false;

  useEffect(() => {
    if (!dismissKey) {
      shownAtRef.current = null;
      setEntered(false);
      return undefined;
    }

    shownAtRef.current = Date.now();
    setEntered(false);
    const raf = window.requestAnimationFrame(() => setEntered(true));

    // reset — the card/headline pop in via a JS spring below, not the CSS transition, so hide them
    // synchronously until the impact moment instead of letting the two entrances fight each other
    [hammerRef.current, flashRef.current, shock1Ref.current, shock2Ref.current].forEach((el) => {
      el?.getAnimations?.().forEach((a) => a.cancel());
    });
    if (cardRef.current) {
      cardRef.current.style.transform = "scale(0.8)";
      cardRef.current.style.opacity = "0";
    }
    if (headlineRef.current) {
      headlineRef.current.style.transform = "scale(2.4)";
      headlineRef.current.style.opacity = "0";
      headlineRef.current.style.filter = "blur(7px)";
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const windUp = reduceMotion ? 0 : 220;

    const impactTimer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      const screenEl = screenRef.current;
      if (canvas && screenEl) {
        const rect = screenEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, rect.width * dpr);
        canvas.height = Math.max(1, rect.height * dpr);
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      if (hammerRef.current?.animate) {
        hammerRef.current.animate(
          [
            { transform: "translate(-50%,-50%) rotate(-52deg) scale(0.9)", opacity: 1, offset: 0 },
            { transform: "translate(-50%,-50%) rotate(4deg) scale(1.05)", opacity: 1, offset: 0.55 },
            { transform: "translate(-50%,-50%) rotate(-6deg) scale(1)", opacity: 1, offset: 0.8 },
            { transform: "translate(-50%,-50%) rotate(-6deg) scale(1)", opacity: 0, offset: 1 },
          ],
          { duration: 260, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" },
        );
      }
      if (flashRef.current?.animate) {
        flashRef.current.animate(
          [{ opacity: 0 }, { opacity: 0.85, offset: 0.16 }, { opacity: 0 }],
          { duration: 320, easing: "ease-out", fill: "forwards" },
        );
      }
      [shock1Ref.current, shock2Ref.current].forEach((ring, idx) => {
        if (!ring?.animate) return;
        ring.animate(
          [
            { opacity: 0, transform: "scale(0.3)", offset: 0 },
            { opacity: 1, transform: "scale(0.5)", offset: 0.08 },
            { opacity: 0, transform: "scale(6.5)", offset: 1 },
          ],
          { duration: 520, delay: idx * 70, easing: "ease-out", fill: "forwards" },
        );
      });

      if (!reduceMotion && screenRef.current) shakeElement(screenRef.current, 320, 7);
      if (canvas && screenRef.current) burstParticles(canvas, screenRef.current, reduceMotion);
      playImpactSound(audioCtxRef);

      springTo(0.8, 1, 170, 13, (v) => {
        if (!cardRef.current) return;
        cardRef.current.style.transform = `scale(${v.toFixed(4)})`;
        cardRef.current.style.opacity = String(Math.min(1, Math.max(0, (v - 0.8) / 0.06)));
      });
      springTo(2.4, 1, 130, 11, (v) => {
        if (!headlineRef.current) return;
        headlineRef.current.style.transform = `scale(${v.toFixed(4)})`;
        headlineRef.current.style.opacity = "1";
        headlineRef.current.style.filter = v > 1.15 ? `blur(${Math.min(3, (v - 1) * 3).toFixed(2)}px)` : "blur(0px)";
      });
    }, windUp);

    const dismissTimer = window.setTimeout(() => onDoneRef.current(), DISPLAY_MS);

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || shownAtRef.current == null) return;
      if (Date.now() - shownAtRef.current >= DISPLAY_MS) {
        onDoneRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(impactTimer);
      window.clearTimeout(dismissTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dismissKey]);

  if (!celebration || !mounted) return null;

  const headline = spotCelebrationHeadline(celebration.kind, { viewerIsWinner });
  const accessibilityLabel = formatSpotCelebrationAccessibility(celebration, { viewerIsWinner });

  return createPortal(
    <div
      ref={screenRef}
      className={`pointer-events-none fixed inset-0 z-[130] flex items-center justify-center overflow-hidden bg-black/55 px-6 transition-opacity duration-200 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      role="status"
      aria-live="assertive"
      aria-label={accessibilityLabel}
    >
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" />
      <div ref={flashRef} aria-hidden className="pointer-events-none absolute inset-0 bg-white opacity-0" />
      <div
        ref={shock1Ref}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-0"
        style={{ borderColor: "rgba(212,175,55,0.9)" }}
      />
      <div
        ref={shock2Ref}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-0"
        style={{ borderColor: "rgba(255,255,255,0.6)" }}
      />
      <div
        ref={hammerRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 opacity-0"
        style={{ transformOrigin: "85% 15%" }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="14" width="15" height="4.5" rx="1.2" transform="rotate(-45 2 14)" fill="#D4AF37" />
          <rect x="11.5" y="2" width="8" height="8" rx="1.4" transform="rotate(-45 11.5 2)" fill="#FFE9A8" />
          <rect x="9" y="4.5" width="8" height="8" rx="1.4" transform="rotate(-45 9 4.5)" fill="#D4AF37" />
        </svg>
      </div>

      <div className="relative w-full max-w-[360px]">
        <div
          ref={cardRef}
          className="rounded-2xl p-[2px] shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_70px_rgba(212,175,55,0.3)]"
          style={{ background: "linear-gradient(135deg,#FFE9A8,#D4AF37 40%,#9A7B2C)" }}
        >
          <div
            className="rounded-[14px] bg-[#0c0c0e] px-6 py-6 text-center"
            style={{ border: "1px solid rgba(212,175,55,0.15)" }}
          >
            <p className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-amber-200">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M14 3l7 7-2 2-7-7 2-2z" fill="#D4AF37" />
                <path d="M12.5 6.5l5 5L6 23H3v-3l9.5-13.5z" fill="#D4AF37" />
              </svg>
              {spotCelebrationKicker(celebration.kind)}
            </p>
            <p
              ref={headlineRef}
              className="mt-2 inline-block text-3xl font-black tracking-wide text-white drop-shadow-[0_2px_20px_rgba(212,175,55,0.4)] sm:text-4xl"
            >
              {headline}
            </p>
            <p className="mt-4 text-xl font-extrabold text-amber-200 sm:text-2xl">{celebration.label}</p>
            {!viewerIsWinner ? (
              <p className="mt-1 text-sm font-bold text-zinc-400">@{celebration.username}</p>
            ) : null}
            <p className="mt-4 text-xs font-semibold text-zinc-500">{spotCelebrationTagline(celebration.kind)}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
