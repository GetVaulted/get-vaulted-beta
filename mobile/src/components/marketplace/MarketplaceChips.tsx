import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { MARKETPLACE_CHIPS, type MarketplaceChipId } from '../../lib/marketplaceChips';
import { MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { colors } from '../../theme';

export function MarketplaceChips({
  active,
  onChange,
  bleed,
}: {
  active: MarketplaceChipId;
  onChange: (id: MarketplaceChipId) => void;
  /** Screen side padding — the row runs edge to edge and scrolls under it. */
  bleed: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={[styles.row, { paddingHorizontal: bleed }]}
    >
      {MARKETPLACE_CHIPS.map((chip) => {
        const on = chip.id === active;
        return (
          <Pressable
            key={chip.id}
            onPress={() => onChange(chip.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1} {...MARKETPLACE_TEXT_PROPS}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, alignItems: 'center' },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  labelOn: { color: '#050505', fontWeight: '700' },
});
