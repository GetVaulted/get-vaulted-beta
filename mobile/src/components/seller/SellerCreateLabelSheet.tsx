import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  previewBundledShippingRates,
  type ManualParcel,
  type PreviewShippingRate,
  type SellerLabelPrintFormat,
} from '../../api/sellerLiveShippingRepository';
import { colors, radii, spacing } from '../../theme';

export const PARCEL_PRESETS: Array<{
  label: string;
  description: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}> = [
  { label: 'Card mailer', description: 'PWE / bubble mailer, a few cards', weightOz: 4, lengthIn: 6, widthIn: 4, heightIn: 1 },
  { label: 'Padded mailer', description: 'Bubble mailer, stack of cards', weightOz: 8, lengthIn: 9, widthIn: 6, heightIn: 1 },
  { label: 'Small box', description: 'Graded slab, loose packs', weightOz: 16, lengthIn: 10, widthIn: 7, heightIn: 3 },
  { label: 'Medium box', description: 'Large haul from a break', weightOz: 32, lengthIn: 12, widthIn: 9, heightIn: 5 },
  { label: 'Mini helmet', description: 'Mini collectible helmet (~1.5 lbs)', weightOz: 24, lengthIn: 11, widthIn: 8, heightIn: 7 },
  { label: 'Full-size helmet', description: 'Full helmet (~5 lbs)', weightOz: 80, lengthIn: 14, widthIn: 12, heightIn: 12 },
];

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** When set, quotes bundle rates before purchase (live combined packages). */
  bundleSessionId?: string | null;
  accessToken?: string;
  confirmBusy?: boolean;
  onClose: () => void;
  onConfirm: (parcel: ManualParcel, labelFormat: SellerLabelPrintFormat, selectedRateObjectId?: string) => void;
};

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

export function SellerCreateLabelSheet({
  visible,
  title,
  subtitle,
  bundleSessionId,
  accessToken,
  confirmBusy,
  onClose,
  onConfirm,
}: Props) {
  const [activePreset, setActivePreset] = useState(PARCEL_PRESETS[0]!.label);
  const [labelFormat, setLabelFormat] = useState<SellerLabelPrintFormat>('thermal_4x6');
  const [weightOz, setWeightOz] = useState('4');
  const [lengthIn, setLengthIn] = useState('6');
  const [widthIn, setWidthIn] = useState('4');
  const [heightIn, setHeightIn] = useState('1');
  const [rateBusy, setRateBusy] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rates, setRates] = useState<PreviewShippingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [chargedCents, setChargedCents] = useState(0);
  const rateReqId = useRef(0);

  const parsedParcel = useMemo(
    () => ({
      weightOz: parseFloat(weightOz),
      lengthIn: parseFloat(lengthIn),
      widthIn: parseFloat(widthIn),
      heightIn: parseFloat(heightIn),
    }),
    [weightOz, lengthIn, widthIn, heightIn],
  );
  const parcelValid = Object.values(parsedParcel).every((v) => Number.isFinite(v) && v > 0);
  const isBundle = Boolean(bundleSessionId && accessToken);

  useEffect(() => {
    if (!visible || !isBundle || !parcelValid || !bundleSessionId || !accessToken) {
      setRates([]);
      setSelectedRateId(null);
      setRateError(null);
      setRateBusy(false);
      return;
    }
    const reqId = ++rateReqId.current;
    setRateBusy(true);
    setRateError(null);
    const t = setTimeout(() => {
      void (async () => {
        const result = await previewBundledShippingRates(accessToken, bundleSessionId, parsedParcel);
        if (rateReqId.current !== reqId) return;
        if (!result.ok) {
          setRates([]);
          setSelectedRateId(null);
          setRateError(result.error);
          setRateBusy(false);
          return;
        }
        setRates(result.rates);
        setSelectedRateId(result.rates[0]?.objectId ?? null);
        setChargedCents(result.shippingChargedCents);
        setRateError(null);
        setRateBusy(false);
      })();
    }, 450);
    return () => clearTimeout(t);
  }, [visible, isBundle, parcelValid, weightOz, lengthIn, widthIn, heightIn, bundleSessionId, accessToken]);

  const applyPreset = (p: (typeof PARCEL_PRESETS)[number]) => {
    setWeightOz(String(p.weightOz));
    setLengthIn(String(p.lengthIn));
    setWidthIn(String(p.widthIn));
    setHeightIn(String(p.heightIn));
    setActivePreset(p.label);
  };

  const selectedRate = rates.find((r) => r.objectId === selectedRateId) ?? rates[0] ?? null;
  const canConfirm =
    parcelValid &&
    !confirmBusy &&
    (!isBundle || (Boolean(selectedRate?.objectId) && !rateBusy && !rateError));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}>
            <Text style={styles.sectionLabel}>Package type</Text>
            <View style={styles.presetGrid}>
              {PARCEL_PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  style={[styles.preset, activePreset === p.label && styles.presetActive]}
                  onPress={() => applyPreset(p)}
                >
                  <Text style={[styles.presetTitle, activePreset === p.label && styles.presetTitleActive]}>
                    {p.label}
                  </Text>
                  <Text style={styles.presetDesc} numberOfLines={2}>
                    {p.description}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.dimsRow}>
              <Field label="Weight (oz)" value={weightOz} onChange={setWeightOz} />
              <Field label="L (in)" value={lengthIn} onChange={setLengthIn} />
              <Field label="W (in)" value={widthIn} onChange={setWidthIn} />
              <Field label="H (in)" value={heightIn} onChange={setHeightIn} />
            </View>

            <Text style={styles.sectionLabel}>Label size</Text>
            <View style={styles.formatRow}>
              {(
                [
                  { id: 'thermal_4x6' as const, label: '4×6 thermal' },
                  { id: 'letter' as const, label: 'Letter' },
                ] as const
              ).map((f) => (
                <Pressable
                  key={f.id}
                  style={[styles.formatChip, labelFormat === f.id && styles.formatChipActive]}
                  onPress={() => setLabelFormat(f.id)}
                >
                  <Text style={[styles.formatTxt, labelFormat === f.id && styles.formatTxtActive]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>

            {isBundle ? (
              <View style={styles.ratesBox}>
                <Text style={styles.sectionLabel}>Carrier rate</Text>
                {rateBusy ? <ActivityIndicator color={colors.gold} /> : null}
                {rateError ? <Text style={styles.error}>{rateError}</Text> : null}
                {!rateBusy && !rateError
                  ? rates.map((r) => {
                      const selected = (selectedRate?.objectId ?? null) === r.objectId;
                      return (
                        <Pressable
                          key={r.objectId}
                          style={[styles.rateRow, selected && styles.rateRowActive]}
                          onPress={() => setSelectedRateId(r.objectId)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rateCarrier}>
                              {r.carrier} · {r.service}
                            </Text>
                            {r.estimatedDays != null ? (
                              <Text style={styles.rateDays}>{r.estimatedDays} day est.</Text>
                            ) : null}
                          </View>
                          <Text style={styles.rateAmt}>${(r.amountCents / 100).toFixed(2)}</Text>
                        </Pressable>
                      );
                    })
                  : null}
                {selectedRate && chargedCents > 0 ? (
                  <Text style={styles.marginHint}>
                    Buyer paid ${(chargedCents / 100).toFixed(2)} shipping · you pay $
                    {(selectedRate.amountCents / 100).toFixed(2)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            style={[styles.confirm, !canConfirm && styles.confirmDisabled]}
            disabled={!canConfirm}
            onPress={() =>
              onConfirm(parsedParcel, labelFormat, isBundle ? selectedRate?.objectId : undefined)
            }
          >
            {confirmBusy ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text style={styles.confirmTxt}>
                Create {labelFormat === 'thermal_4x6' ? '4×6' : 'letter'} label
                {selectedRate ? ` · $${(selectedRate.amountCents / 100).toFixed(2)}` : ''}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#0e0e12',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  close: { color: colors.gold, fontSize: 14, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    width: '48%',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    gap: 2,
  },
  presetActive: { borderColor: colors.gold, backgroundColor: `${colors.gold}14` },
  presetTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  presetTitleActive: { color: colors.gold },
  presetDesc: { color: colors.textMuted, fontSize: 10, lineHeight: 14 },
  dimsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { width: '23%', gap: 4 },
  fieldLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 14,
    backgroundColor: colors.surfaceElevated,
  },
  formatRow: { flexDirection: 'row', gap: 8 },
  formatChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formatChipActive: { borderColor: '#38BDF8', backgroundColor: 'rgba(56,189,248,0.15)' },
  formatTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  formatTxtActive: { color: '#7DD3FC' },
  ratesBox: { gap: 8 },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rateRowActive: { borderColor: '#38BDF8', backgroundColor: 'rgba(56,189,248,0.12)' },
  rateCarrier: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  rateDays: { color: colors.textMuted, fontSize: 11 },
  rateAmt: { color: colors.gold, fontSize: 14, fontWeight: '800' },
  marginHint: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  error: { color: '#FCA5A5', fontSize: 12 },
  confirm: {
    marginTop: spacing.sm,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDisabled: { opacity: 0.45 },
  confirmTxt: { color: '#0a0a0a', fontSize: 14, fontWeight: '800' },
});
