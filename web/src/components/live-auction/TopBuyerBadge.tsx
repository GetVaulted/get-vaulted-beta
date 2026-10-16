/**
 * Chat badge for the platform's top buyer (most paid orders, all-time): a gold "V" on black inside a
 * wavy-edged circle with gold trim. Pure SVG so it stays crisp at chat sizes.
 */
const CX = 16;
const CY = 16;
const BASE_R = 13.2;
const WAVE_AMPLITUDE = 1.5;
const LOBES = 12;
const SAMPLES = 144;

/** Closed polar path: a circle whose radius ripples `LOBES` times around the edge. */
const WAVE_PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = (i / SAMPLES) * Math.PI * 2;
    const r = BASE_R + WAVE_AMPLITUDE * Math.cos(LOBES * t);
    const x = CX + r * Math.cos(t);
    const y = CY + r * Math.sin(t);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${pts.join(" ")} Z`;
})();

export function TopBuyerBadge({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="Top buyer"
      className={`inline-block shrink-0 align-middle ${className}`}
    >
      <title>Top Buyer — most orders on Get Vaulted</title>
      <defs>
        <linearGradient id="gv-top-buyer-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e7a8" />
          <stop offset="0.5" stopColor="#c9a227" />
          <stop offset="1" stopColor="#8a7020" />
        </linearGradient>
      </defs>
      <path d={WAVE_PATH} fill="#050505" stroke="url(#gv-top-buyer-gold)" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx={CX} cy={CY} r="10.4" fill="none" stroke="#c9a227" strokeOpacity="0.5" strokeWidth="0.6" />
      <path d="M8.9 9.6H13.1L16 16.9L18.9 9.6H23.1L17.9 22.4H14.1Z" fill="url(#gv-top-buyer-gold)" />
    </svg>
  );
}
