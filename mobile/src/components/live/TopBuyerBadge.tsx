import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * Chat badge for the platform's top buyer (most paid orders, all-time): a gold "V" on black inside a
 * wavy-edged circle with gold trim. Mirrors web/src/components/live-auction/TopBuyerBadge.tsx.
 */
const CX = 16;
const CY = 16;
const BASE_R = 13.2;
const WAVE_AMPLITUDE = 1.5;
const LOBES = 12;
const SAMPLES = 144;

const WAVE_PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = (i / SAMPLES) * Math.PI * 2;
    const r = BASE_R + WAVE_AMPLITUDE * Math.cos(LOBES * t);
    pts.push(`${i === 0 ? 'M' : 'L'}${(CX + r * Math.cos(t)).toFixed(2)} ${(CY + r * Math.sin(t)).toFixed(2)}`);
  }
  return `${pts.join(' ')} Z`;
})();

export function TopBuyerBadge({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="Top buyer">
      <Defs>
        <LinearGradient id="gvTopBuyerGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#f6e7a8" />
          <Stop offset="0.5" stopColor="#c9a227" />
          <Stop offset="1" stopColor="#8a7020" />
        </LinearGradient>
      </Defs>
      <Path d={WAVE_PATH} fill="#050505" stroke="url(#gvTopBuyerGold)" strokeWidth={1.7} strokeLinejoin="round" />
      <Circle cx={CX} cy={CY} r={10.4} fill="none" stroke="#c9a227" strokeOpacity={0.5} strokeWidth={0.6} />
      <Path d="M8.9 9.6H13.1L16 16.9L18.9 9.6H23.1L17.9 22.4H14.1Z" fill="url(#gvTopBuyerGold)" />
    </Svg>
  );
}
