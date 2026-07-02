import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LiveLotSaleType, QuickLiveLotInput } from '../../../lib/liveAuctionPricing';
import { colors, radii, spacing } from '../../../theme';

export function QuickLiveLotFields({
  value,
  onChange,
  disabled,
}: {
  value: QuickLiveLotInput;
  onChange: (next: QuickLiveLotInput) => void;
  disabled?: boolean;
}) {
  const setSaleType = (saleType: LiveLotSaleType) => onChange({ ...value, saleType });
  const priceLabel = value.saleType === 'auction' ? 'Starting bid' : 'Buy-it-now price';

  return (
    <View style={styles.wrap}>
      <Text style={styles.fieldLbl}>Sale type</Text>
      <View style={styles.toggleRow}>
        {(['auction', 'buy_now'] as const).map((type) => {
          const active = value.saleType === type;
          return (
            <Pressable
              key={type}
              style={[styles.toggleBtn, active && styles.toggleBtnActive, disabled && styles.toggleOff]}
              onPress={() => setSaleType(type)}
              disabled={disabled}
            >
              <Text style={[styles.toggleBtnTxt, active && styles.toggleBtnTxtActive]}>
                {type === 'auction' ? 'Auction' : 'Buy It Now'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldHint}>
        {value.saleType === 'auction'
          ? 'Buyers bid until the timer ends.'
          : 'Fixed price — buyers purchase instantly when the lot is pinned.'}
      </Text>

      <Text style={styles.fieldLbl}>{priceLabel}</Text>
      <TextInput
        value={value.price}
        onChangeText={(price) => onChange({ ...value, price })}
        placeholder={value.saleType === 'auction' ? '1' : '25'}
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        editable={!disabled}
        style={[styles.input, disabled && styles.inputOff]}
      />

      <Text style={styles.fieldLbl}>Quantity</Text>
      <TextInput
        value={value.quantity}
        onChangeText={(quantity) => onChange({ ...value, quantity })}
        placeholder="1"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        editable={!disabled}
        style={[styles.input, disabled && styles.inputOff]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  fieldLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggleBtn: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  toggleBtnActive: {
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  toggleOff: { opacity: 0.55 },
  toggleBtnTxt: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  toggleBtnTxtActive: { color: colors.gold },
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
