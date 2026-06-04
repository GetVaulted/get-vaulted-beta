import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { AuctionPricingInput } from '../../../lib/liveAuctionPricing';
import { colors, radii, spacing } from '../../../theme';

export function AuctionPricingFields({
  value,
  onChange,
  disabled,
}: {
  value: AuctionPricingInput;
  onChange: (next: AuctionPricingInput) => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<AuctionPricingInput>) => onChange({ ...value, ...patch });

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Lot setup</Text>
      <Text style={styles.sectionSub}>
        Set quantity and pricing before queueing. Bid increments are automatic. Editable until bidding starts.
      </Text>
      <View style={styles.grid}>
        <Field
          label="Quantity"
          value={value.quantity}
          onChangeText={(quantity) => set({ quantity })}
          placeholder="1"
          keyboardType="number-pad"
          disabled={disabled}
        />
        <Field
          label="Starting bid"
          value={value.startingBid}
          onChangeText={(startingBid) => set({ startingBid })}
          placeholder="1"
          keyboardType="decimal-pad"
          disabled={disabled}
        />
        <Field
          label="Reserve (optional)"
          value={value.reservePrice}
          onChangeText={(reservePrice) => set({ reservePrice })}
          placeholder="Hidden minimum"
          keyboardType="decimal-pad"
          disabled={disabled}
        />
        <Field
          label="Buy it now (optional)"
          value={value.buyNowPrice}
          onChangeText={(buyNowPrice) => set({ buyNowPrice })}
          placeholder="Instant purchase"
          keyboardType="decimal-pad"
          disabled={disabled}
        />
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  disabled,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder: string;
  keyboardType: 'decimal-pad' | 'number-pad';
  disabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        editable={!disabled}
        style={[styles.input, disabled && styles.inputOff]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  sectionSub: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  grid: { gap: spacing.sm },
  field: { gap: 4 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  inputOff: { opacity: 0.55 },
});
