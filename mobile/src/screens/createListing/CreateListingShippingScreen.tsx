import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchListingShippoRates } from '../../api/shippoListingRatesRepository';
import { useCreateListingDraft } from '../../createListing/CreateListingDraftContext';
import { LISTING_FLOW_STEP } from '../../createListing/listingChannel';
import {
  formatListingRatePrice,
  isPackageDetailsComplete,
  listingRateLabel,
  packageWeightLbTotal,
  parsePackageNumber,
  type ListingShippoRate,
} from '../../createListing/shippoRates';
import type { CreateListingStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { CreateListingChrome } from './CreateListingChrome';
import { useCreateListingFlow } from './createListingFlowHelpers';
import { useCreateListingNavigation } from './useCreateListingNavigation';

function ShippingField({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function RateCard({
  rate,
  selected,
  handlingFee,
  onSelect,
}: {
  rate: ListingShippoRate;
  selected: boolean;
  handlingFee: number;
  onSelect: () => void;
}) {
  const title = listingRateLabel(rate);
  const price = formatListingRatePrice(rate.amount, rate.currency, handlingFee);

  return (
    <Pressable style={[styles.rateCard, selected && styles.rateCardOn]} onPress={onSelect}>
      <View style={styles.rateHead}>
        <Text style={styles.rateTitle}>{title}</Text>
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.gold : colors.textMuted} />
      </View>
      <Text style={styles.rateEta}>{rate.estimatedDelivery}</Text>
      <Text style={styles.ratePrice}>{price}</Text>
      <View style={styles.rateMetaRow}>
        {rate.trackingIncluded ? (
          <View style={styles.rateBadge}>
            <Ionicons name="locate-outline" size={12} color={colors.gold} />
            <Text style={styles.rateBadgeTxt}>Tracking included</Text>
          </View>
        ) : (
          <Text style={styles.rateMuted}>Tracking varies by service</Text>
        )}
        {rate.insuranceAvailable ? (
          <Text style={styles.rateMuted}>Insurance available</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Footer({
  onBack,
  onNext,
  nextLabel,
  disabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.footRow}>
      {onBack ? (
        <Pressable style={styles.footBack} onPress={onBack}>
          <Text style={styles.footBackTxt}>Back</Text>
        </Pressable>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <Pressable style={[styles.footNext, disabled && styles.footNextOff]} onPress={() => !disabled && onNext()} disabled={disabled}>
        <Text style={styles.footNextTxt}>{nextLabel}</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.background} />
      </Pressable>
    </View>
  );
}

export function CreateListingShippingScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingShipping'>) {
  const { form, setForm } = useCreateListingDraft();
  const { channel, totalSteps } = useCreateListingFlow();
  const { exitFlow, goBackStep } = useCreateListingNavigation();

  const [rates, setRates] = useState<ListingShippoRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [mockRates, setMockRates] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const handlingFee = useMemo(() => {
    const n = Number(form.shippingHandlingFee.replace(/,/g, '').trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [form.shippingHandlingFee]);

  const packageReady = isPackageDetailsComplete(form);

  const loadRates = useCallback(async () => {
    if (!packageReady) {
      setRates([]);
      setFetchError(null);
      return;
    }

    const weight = packageWeightLbTotal(form)!;
    const length = parsePackageNumber(form.packageLengthIn)!;
    const width = parsePackageNumber(form.packageWidthIn)!;
    const height = parsePackageNumber(form.packageHeightIn)!;
    const zip = form.shipFromZip.replace(/\D/g, '').slice(0, 5);

    const reqId = ++requestIdRef.current;
    setLoading(true);
    setFetchError(null);

    const result = await fetchListingShippoRates({
      shipFromZip: zip,
      weightLb: weight,
      lengthIn: length,
      widthIn: width,
      heightIn: height,
      international: form.international,
    });

    if (reqId !== requestIdRef.current) return;

    setLoading(false);
    setMockRates(Boolean(result.mock));
    if (result.error && result.rates.length === 0) {
      setFetchError(result.error);
      setRates([]);
      setForm({ selectedShippoRate: null, shippingMethod: '' });
      return;
    }

    if (result.rates.length === 0) {
      setFetchError('Shipping rates could not be loaded. Check package details and try again.');
      setRates([]);
      setForm({ selectedShippoRate: null, shippingMethod: '' });
      return;
    }

    setFetchError(result.error ?? null);
    setRates(result.rates);

    const selectedId = form.selectedShippoRate?.id;
    if (selectedId && !result.rates.some((r) => r.id === selectedId)) {
      setForm({ selectedShippoRate: null, shippingMethod: '' });
    }
  }, [
    packageReady,
    form.packageWeightLb,
    form.packageWeightOz,
    form.packageLengthIn,
    form.packageWidthIn,
    form.packageHeightIn,
    form.shipFromZip,
    form.international,
    form.selectedShippoRate?.id,
    setForm,
  ]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!packageReady) {
      setRates([]);
      setFetchError(null);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void loadRates();
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [packageReady, loadRates]);

  const selectRate = (rate: ListingShippoRate) => {
    setForm({
      selectedShippoRate: rate,
      shippingMethod: listingRateLabel(rate),
    });
  };

  const patchPackage = (patch: {
    packageWeightLb?: string;
    packageWeightOz?: string;
    packageLengthIn?: string;
    packageWidthIn?: string;
    packageHeightIn?: string;
    shipFromZip?: string;
  }) => {
    setForm({ ...patch, selectedShippoRate: null, shippingMethod: '' });
  };

  return (
    <CreateListingChrome
      step={LISTING_FLOW_STEP.marketplace.shipping}
      total={totalSteps}
      channel={channel}
      title="Shipping"
      subtitle="Live Shippo carrier rates — select the service buyers will see at checkout."
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionK}>Package details</Text>
        <Text style={styles.sectionHint}>Required before we can fetch carrier rates.</Text>

        <View style={styles.dimRow}>
          <View style={styles.dimHalf}>
            <ShippingField
              label="Weight (lb)"
              value={form.packageWeightLb}
              onChange={(t) => patchPackage({ packageWeightLb: t })}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.dimHalf}>
            <ShippingField
              label="Weight (oz)"
              value={form.packageWeightOz}
              onChange={(t) => patchPackage({ packageWeightOz: t })}
              placeholder="8"
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <ShippingField
          label="Ship-from ZIP"
          value={form.shipFromZip}
          onChange={(t) => patchPackage({ shipFromZip: t })}
          placeholder="94103"
          keyboardType="number-pad"
        />

        <View style={styles.dimRow}>
          <View style={styles.dimThird}>
            <ShippingField
              label="Length (in)"
              value={form.packageLengthIn}
              onChange={(t) => patchPackage({ packageLengthIn: t })}
              placeholder="10"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.dimThird}>
            <ShippingField
              label="Width (in)"
              value={form.packageWidthIn}
              onChange={(t) => patchPackage({ packageWidthIn: t })}
              placeholder="8"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.dimThird}>
            <ShippingField
              label="Height (in)"
              value={form.packageHeightIn}
              onChange={(t) => patchPackage({ packageHeightIn: t })}
              placeholder="4"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <ShippingField
          label="Handling fee (optional)"
          value={form.shippingHandlingFee}
          onChange={(t) => setForm({ shippingHandlingFee: t })}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.toggleLbl}>International support</Text>
            <Text style={styles.toggleHint}>When enabled, quotes include international benchmark destinations.</Text>
          </View>
          <Switch
            value={form.international}
            onValueChange={(v) => setForm({ international: v, selectedShippoRate: null, shippingMethod: '' })}
            trackColor={{ false: '#333', true: 'rgba(212,175,55,0.45)' }}
            thumbColor={form.international ? colors.gold : '#888'}
          />
        </View>

        <Text style={styles.sectionK}>Carrier rates</Text>
        {!packageReady ? (
          <Text style={styles.sectionHint}>Enter package weight, dimensions, and ship-from ZIP to load rates.</Text>
        ) : null}

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.stateTxt}>Fetching live carrier rates…</Text>
          </View>
        ) : null}

        {!loading && packageReady && rates.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.textMuted} />
            <Text style={styles.stateTxt}>
              {fetchError ?? 'Shipping rates could not be loaded. Check package details and try again.'}
            </Text>
            <Pressable style={styles.retryBtn} onPress={() => void loadRates()}>
              <Text style={styles.retryTxt}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {mockRates && rates.length > 0 ? (
          <Text style={styles.mockNotice}>Sample rates shown — connect SHIPPO_API_TOKEN for live quotes.</Text>
        ) : null}

        {!loading
          ? rates.map((rate) => (
              <RateCard
                key={rate.id}
                rate={rate}
                selected={form.selectedShippoRate?.id === rate.id}
                handlingFee={handlingFee}
                onSelect={() => selectRate(rate)}
              />
            ))
          : null}

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.toggleLbl}>Shipping insurance</Text>
            <Text style={styles.toggleHint}>
              Insurance availability depends on the selected carrier and shipment value.
            </Text>
          </View>
          <Switch
            value={form.insurance}
            onValueChange={(v) => setForm({ insurance: v })}
            trackColor={{ false: '#333', true: 'rgba(212,175,55,0.45)' }}
            thumbColor={form.insurance ? colors.gold : '#888'}
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLbl}>Signature confirmation</Text>
          <Switch
            value={form.signature}
            onValueChange={(v) => setForm({ signature: v })}
            trackColor={{ false: '#333', true: 'rgba(212,175,55,0.45)' }}
            thumbColor={form.signature ? colors.gold : '#888'}
          />
        </View>
      </ScrollView>

      <Footer
        onBack={() => navigation.goBack()}
        onNext={() => navigation.navigate('CreateListingReview')}
        nextLabel="Review"
        disabled={!form.selectedShippoRate}
      />
    </CreateListingChrome>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionK: { ...typography.micro, color: colors.gold, letterSpacing: 0.8, marginTop: spacing.sm },
  sectionHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  fieldBlock: { gap: spacing.xs },
  fieldLbl: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  dimRow: { flexDirection: 'row', gap: spacing.sm },
  dimHalf: { flex: 1 },
  dimThird: { flex: 1 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toggleLbl: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  toggleHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  stateBox: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  stateTxt: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  retryTxt: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  mockNotice: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  rateCard: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
  },
  rateCardOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.06)' },
  rateHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  rateTitle: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  rateEta: { color: colors.textSecondary, fontSize: 13 },
  ratePrice: { color: colors.gold, fontSize: 18, fontWeight: '800', marginTop: 2 },
  rateMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  rateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rateBadgeTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  rateMuted: { color: colors.textMuted, fontSize: 12 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 'auto', paddingVertical: spacing.lg },
  footBack: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  footBackTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  footNext: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
  },
  footNextOff: { opacity: 0.45 },
  footNextTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
});
