import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrowsePulledCard } from '../browse/BrowseVisualRows';
import { colors, spacing } from '../../theme';
import type { SaleActivity } from '../../types';

export function MarketplaceSoldTicker({ sales }: { sales: SaleActivity[] }) {
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const doubled = [...sales, ...sales];

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Animated.View style={[styles.soldPill, { opacity: pulse }]}>
          <Text style={styles.soldTxt}>Sold</Text>
        </Animated.View>
        <Text style={styles.title}>Recently sold</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {doubled.map((sale, i) => (
          <BrowsePulledCard key={`${sale.id}-${i}`} sale={sale} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  soldPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  soldTxt: { fontSize: 9, fontWeight: '900', color: colors.gold, letterSpacing: 0.8 },
  title: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  rail: { paddingRight: spacing.lg },
});
