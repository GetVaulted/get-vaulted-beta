import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import type { SellerAnalyticsSnapshot } from '../../../api/sellerAnalyticsRepository';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

const CHART_W = 320;
const CHART_H = 132;
const PLOT_LEFT = 20;
const PLOT_RIGHT = 300;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 100;
const DAY_LABEL_Y = 122;

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Round a dollar ceiling up to a clean axis top with ~20% headroom above the peak. */
function niceAxisMax(peakUsd: number): number {
  const withHeadroom = Math.max(10, peakUsd * 1.2);
  const step = withHeadroom > 200 ? 50 : withHeadroom > 50 ? 25 : 10;
  return Math.ceil(withHeadroom / step) * step;
}

export function SellerHQRevenuePaceCard({ analytics }: { analytics: SellerAnalyticsSnapshot }) {
  const days = analytics.revenueByDay;
  const hasRevenue = analytics.revenueThisWeekCents > 0 || days.some((d) => d.totalCents > 0);

  const prev = analytics.revenuePrevWeekCents;
  const cur = analytics.revenueThisWeekCents;
  let deltaLabel: string | null = null;
  let deltaUp = true;
  if (prev > 0) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    deltaUp = pct >= 0;
    deltaLabel = `${pct >= 0 ? '+' : ''}${pct}%`;
  } else if (cur > 0) {
    deltaLabel = 'New';
  }

  const valuesUsd = days.map((d) => d.totalCents / 100);
  const axisMax = niceAxisMax(Math.max(1, ...valuesUsd));
  const stepX = days.length > 1 ? (PLOT_RIGHT - PLOT_LEFT) / (days.length - 1) : 0;
  const points = days.map((d, i) => ({
    x: PLOT_LEFT + i * stepX,
    y: PLOT_BOTTOM - (d.totalCents / 100 / axisMax) * (PLOT_BOTTOM - PLOT_TOP),
    label: d.dateLabel,
    valueCents: d.totalCents,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    points.length > 0
      ? `M${points[0].x.toFixed(1)},${PLOT_BOTTOM} ${points
          .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(' ')} L${points[points.length - 1].x.toFixed(1)},${PLOT_BOTTOM} Z`
      : '';
  const endpoint = points[points.length - 1];

  return (
    <View style={[styles.hero, hq.goldCard]}>
      <LinearGradient
        colors={['rgba(212,175,55,0.2)', 'rgba(10,10,12,0.98)', 'rgba(5,5,5,1)']}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.85, y: 0.9 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.eyebrowRow}>
        <Ionicons name="trending-up-outline" size={13} color={colors.gold} />
        <Text style={styles.eyebrow}>Revenue pace · 7 days</Text>
      </View>

      {!hasRevenue ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>Your revenue pace shows up here</Text>
          <Text style={styles.emptyBody}>Once your first order is paid, this fills in with a day-by-day trend.</Text>
        </View>
      ) : (
        <>
          <View style={styles.topRow}>
            <View>
              <Text style={styles.heroNum}>{formatUsd(cur)}</Text>
              <Text style={styles.heroSub}>vs {formatUsd(prev)} the previous 7 days</Text>
            </View>
            {deltaLabel ? (
              <View style={[styles.deltaChip, !deltaUp && styles.deltaChipDown]}>
                <Ionicons
                  name={deltaUp ? 'trending-up-outline' : 'trending-down-outline'}
                  size={13}
                  color={deltaUp ? colors.success : '#FF9E8A'}
                />
                <Text style={[styles.deltaTxt, !deltaUp && styles.deltaTxtDown]}>{deltaLabel}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.chartWrap}>
            <Svg width="100%" height={136} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
              <Defs>
                <SvgLinearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#D4AF37" stopOpacity={0.38} />
                  <Stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                </SvgLinearGradient>
              </Defs>
              <Line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_RIGHT} y2={PLOT_TOP} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
              <Line
                x1={PLOT_LEFT}
                y1={(PLOT_TOP + PLOT_BOTTOM) / 2}
                x2={PLOT_RIGHT}
                y2={(PLOT_TOP + PLOT_BOTTOM) / 2}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <Line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
              <SvgText x={2} y={PLOT_TOP + 4} fontSize={7.5} fontWeight="700" fill={colors.textMuted}>
                ${axisMax}
              </SvgText>
              <SvgText x={2} y={(PLOT_TOP + PLOT_BOTTOM) / 2 + 3} fontSize={7.5} fontWeight="700" fill={colors.textMuted}>
                ${Math.round(axisMax / 2)}
              </SvgText>
              <SvgText x={8} y={PLOT_BOTTOM + 3} fontSize={7.5} fontWeight="700" fill={colors.textMuted}>
                $0
              </SvgText>
              {areaPath ? <Path d={areaPath} fill="url(#revFill)" /> : null}
              {linePath ? (
                <Path d={linePath} fill="none" stroke={colors.gold} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ) : null}
              {endpoint ? (
                <>
                  <Circle cx={endpoint.x} cy={endpoint.y} r={3.6} fill="#050505" stroke="#E9CB6B" strokeWidth={2} />
                  <SvgText
                    x={Math.max(PLOT_LEFT + 14, endpoint.x - 32)}
                    y={Math.max(PLOT_TOP + 8, endpoint.y - 8)}
                    fontSize={9.5}
                    fontWeight="800"
                    fill="#E9CB6B"
                  >
                    {formatUsd(endpoint.valueCents)}
                  </SvgText>
                </>
              ) : null}
              {points.map((p, i) => (
                <SvgText
                  key={i}
                  x={p.x}
                  y={DAY_LABEL_Y}
                  fontSize={8}
                  fontWeight={i === points.length - 1 ? '800' : '700'}
                  fill={i === points.length - 1 ? colors.gold : colors.textMuted}
                  textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                >
                  {p.label}
                </SvgText>
              ))}
            </Svg>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs, overflow: 'hidden' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.gold },
  topRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm, marginTop: 8 },
  heroNum: { fontSize: 30, fontWeight: '900', letterSpacing: -0.6, color: colors.textPrimary },
  heroSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 4 },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(52,199,89,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.35)',
  },
  deltaChipDown: { backgroundColor: 'rgba(255,59,48,0.12)', borderColor: 'rgba(255,59,48,0.32)' },
  deltaTxt: { fontSize: 12, fontWeight: '800', color: colors.success },
  deltaTxtDown: { color: '#FF9E8A' },
  chartWrap: { marginTop: spacing.sm },
  emptyBlock: { paddingVertical: spacing.md, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  emptyBody: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
});
