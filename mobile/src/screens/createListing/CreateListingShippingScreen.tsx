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
import { useSellerShipFromZipPrefill } from '../../createListing/useSellerShipFromZipPrefill';
import { LISTING_FLOW_STEP } from '../../createListing/listingChannel';
import {
  formatListingRatePrice,
  isLikelyOvernightOrExpressAirRate,
  isPackageDetailsComplete,
  listingRateLabel,
  marketplaceCarrierLabel,
  marketplaceListingRateKey,
  marketplaceOfferableRates,
  parsePackageNumber,
  packageWeightLbTotal,
  uniqueCarriersFromRates,
  type ListingShippoRate,
  type MarketplaceShippingOfferScope,
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

const SCOPE_OPTIONS: { id: MarketplaceShippingOfferScope; label: string; sub: string }[] = [
  { id: 'all', label: 'All services', sub: 'Buyers see every quote Shippo returns for this package' },
  {
    id: 'no_overnight',
    label: 'No overnight / next-day air',
    sub: 'Ground & slower · hides overnight-style lanes (heuristic)',
  },
  { id: 'custom', label: 'Pick carriers', sub: 'Choose USPS, UPS, FedEx, etc. — only carriers Shippo returns for your package' },
];

function RatePreviewCard({
  rate,
  mode,
  allowed,
  excluded,
  handlingFee,
  onToggleAllowed,
}: {
  rate: ListingShippoRate;
  mode: MarketplaceShippingOfferScope;
  allowed: boolean;
  excluded: boolean;
  handlingFee: number;
  onToggleAllowed: () => void;
}) {
  const title = listingRateLabel(rate);
  const price = formatListingRatePrice(rate.amount, rate.currency, handlingFee);

  return (
    <View style={[styles.rateCard, excluded && styles.rateCardMuted, mode === 'custom' && allowed && styles.rateCardOn]}>
      <View style={styles.rateHead}>
        {mode === 'custom' ? (
          <Pressable style={styles.checkHit} onPress={onToggleAllowed} hitSlop={8}>
            <Ionicons name={allowed ? 'checkbox' : 'square-outline'} size={22} color={allowed ? colors.gold : colors.textMuted} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.rateTitle}>{title}</Text>
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
          </View>
          {mode === 'no_overnight' && excluded ? (
            <Text style={styles.rateExcl}>Not offered — overnight / express rule</Text>
          ) : null}
          {mode === 'all' ? <Text style={styles.rateIncl}>Available to buyers at checkout</Text> : null}
          {mode === 'no_overnight' && !excluded ? <Text style={styles.rateIncl}>Available to buyers at checkout</Text> : null}
          {mode === 'custom' && allowed ? <Text style={styles.rateIncl}>Allowed for buyers</Text> : null}
          {mode === 'custom' && !allowed ? <Text style={styles.rateExcl}>Unchecked — not offered</Text> : null}
        </View>
      </View>
    </View>
  );
}

export function CreateListingShippingScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingShipping'>) {
  const { form, setForm } = useCreateListingDraft();
  const sellerShipFromZip = useSellerShipFromZipPrefill();
  const { channel, totalSteps } = useCreateListingFlow();
  const { exitFlow, goBackStep } = useCreateListingNavigation();
  const formRef = useRef(form);
  formRef.current = form;
  const effectiveShipFromZip = form.shipFromZip.trim() || sellerShipFromZip || '';

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

  const packageReady = isPackageDetailsComplete({ ...form, shipFromZip: effectiveShipFromZip });

  const offerablePreview = useMemo(
    () =>
      marketplaceOfferableRates(
        rates,
        form.marketplaceShippingOfferScope,
        form.marketplaceAllowedRateKeys,
        form.marketplaceAllowedCarriers,
      ),
    [rates, form.marketplaceShippingOfferScope, form.marketplaceAllowedRateKeys, form.marketplaceAllowedCarriers],
  );

  const previewCarriers = useMemo(() => uniqueCarriersFromRates(rates), [rates]);

  const applyRatesResult = useCallback(
    (nextRates: ListingShippoRate[]) => {
      const f = formRef.current;
      const carrierKeys = uniqueCarriersFromRates(nextRates);
      let carriers = f.marketplaceAllowedCarriers.filter((k) => carrierKeys.includes(k));
      if (carriers.length === 0 && carrierKeys.length > 0) {
        carriers = carrierKeys;
      }
      const offerable = marketplaceOfferableRates(
        nextRates,
        f.marketplaceShippingOfferScope,
        f.marketplaceAllowedRateKeys,
        carriers,
      );
      setForm({
        marketplaceAllowedCarriers: carriers,
        marketplaceRatesPreviewOk: nextRates.length > 0,
        marketplaceOfferableRateCount: offerable.length,
        selectedShippoRate: null,
        shippingMethod: '',
      });
    },
    [setForm],
  );

  const loadRates = useCallback(async () => {
    if (!packageReady) {
      setRates([]);
      setFetchError(null);
      return;
    }

    const weight = packageWeightLbTotal(formRef.current)!;
    const length = parsePackageNumber(formRef.current.packageLengthIn)!;
    const width = parsePackageNumber(formRef.current.packageWidthIn)!;
    const height = parsePackageNumber(formRef.current.packageHeightIn)!;
    const zip = (formRef.current.shipFromZip.trim() || sellerShipFromZip || '')
      .replace(/\D/g, '')
      .slice(0, 5);
    const shipTo = formRef.current.shipToZip.replace(/\D/g, '').slice(0, 5);

    const reqId = ++requestIdRef.current;
    setLoading(true);
    setFetchError(null);

    const result = await fetchListingShippoRates({
      shipFromZip: zip,
      shipToZip: shipTo.length === 5 ? shipTo : undefined,
      weightLb: weight,
      lengthIn: length,
      widthIn: width,
      heightIn: height,
      international: formRef.current.international,
    });

    if (reqId !== requestIdRef.current) return;

    setLoading(false);
    setMockRates(Boolean(result.mock));
    if (result.error && result.rates.length === 0) {
      setFetchError(result.error);
      setRates([]);
      setForm({
        selectedShippoRate: null,
        shippingMethod: '',
        marketplaceRatesPreviewOk: false,
        marketplaceOfferableRateCount: 0,
      });
      return;
    }

    if (result.rates.length === 0) {
      setFetchError('Shipping rates could not be loaded. Check package details and try again.');
      setRates([]);
      setForm({
        selectedShippoRate: null,
        shippingMethod: '',
        marketplaceRatesPreviewOk: false,
        marketplaceOfferableRateCount: 0,
      });
      return;
    }

    setFetchError(result.error ?? null);
    setRates(result.rates);
    applyRatesResult(result.rates);
  }, [
    packageReady,
    applyRatesResult,
    setForm,
    form.packageWeightLb,
    form.packageWeightOz,
    form.packageLengthIn,
    form.packageWidthIn,
    form.packageHeightIn,
    form.shipFromZip,
    form.shipToZip,
    form.international,
    sellerShipFromZip,
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

  const patchPackage = (patch: {
    packageWeightLb?: string;
    packageWeightOz?: string;
    packageLengthIn?: string;
    packageWidthIn?: string;
    packageHeightIn?: string;
    shipFromZip?: string;
    shipToZip?: string;
  }) => {
    setForm({
      ...patch,
      selectedShippoRate: null,
      shippingMethod: '',
      marketplaceRatesPreviewOk: false,
      marketplaceOfferableRateCount: 0,
    });
  };

  const setScope = (scope: MarketplaceShippingOfferScope) => {
    const f = formRef.current;
    const offerable = marketplaceOfferableRates(
      rates,
      scope,
      f.marketplaceAllowedRateKeys,
      f.marketplaceAllowedCarriers,
    );
    setForm({
      marketplaceShippingOfferScope: scope,
      marketplaceOfferableRateCount: offerable.length,
      marketplaceRatesPreviewOk: rates.length > 0,
      selectedShippoRate: null,
      shippingMethod: '',
    });
  };

  const toggleCarrier = (carrierKey: string) => {
    const set = new Set(formRef.current.marketplaceAllowedCarriers);
    if (set.has(carrierKey)) set.delete(carrierKey);
    else set.add(carrierKey);
    const nextCarriers = [...set];
    const offerable = marketplaceOfferableRates(
      rates,
      formRef.current.marketplaceShippingOfferScope,
      formRef.current.marketplaceAllowedRateKeys,
      nextCarriers,
    );
    setForm({
      marketplaceAllowedCarriers: nextCarriers,
      marketplaceOfferableRateCount: offerable.length,
      marketplaceRatesPreviewOk: rates.length > 0,
      selectedShippoRate: null,
      shippingMethod: '',
    });
  };

  const canContinue =
    packageReady &&
    !loading &&
    rates.length > 0 &&
    form.marketplaceOfferableRateCount > 0 &&
    form.marketplaceAllowedCarriers.length > 0;

  return (
    <CreateListingChrome
      step={LISTING_FLOW_STEP.marketplace.shipping}
      total={totalSteps}
      channel={channel}
      title="Shipping preferences"
      subtitle="You are not choosing the buyer's delivery speed — you define the parcel and which carrier services they can pick."
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.callout}>
          <Ionicons name="information-circle-outline" size={22} color={colors.gold} />
          <Text style={styles.calloutTxt}>
            Buyers will choose from available live carrier rates during checkout. Faster delivery options appear
            there. The app defaults them to the best-value option — you only ship with the label they purchase.
          </Text>
        </View>

        <Text style={styles.sectionK}>Package details</Text>
        <Text style={styles.sectionHint}>Shippo uses this for live quotes at checkout and for label purchase.</Text>

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
        {sellerShipFromZip ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLbl}>Ship-from ZIP</Text>
            <Text style={styles.sellerZipValue}>{sellerShipFromZip}</Text>
            <Text style={styles.sellerZipHint}>From your seller shipping address — update it in Seller HQ if needed.</Text>
          </View>
        ) : (
          <ShippingField
            label="Ship-from ZIP"
            value={form.shipFromZip}
            onChange={(t) => patchPackage({ shipFromZip: t })}
            placeholder="94103"
            keyboardType="number-pad"
          />
        )}
        {!form.international ? (
          <ShippingField
            label="Ship-to ZIP (optional)"
            value={form.shipToZip}
            onChange={(t) => patchPackage({ shipToZip: t })}
            placeholder="Buyer region — for zone-based estimates"
            keyboardType="number-pad"
          />
        ) : null}

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
            onValueChange={(v) =>
              setForm({
                international: v,
                selectedShippoRate: null,
                shippingMethod: '',
                marketplaceRatesPreviewOk: false,
                marketplaceOfferableRateCount: 0,
              })
            }
            trackColor={{ false: '#333', true: 'rgba(212,175,55,0.45)' }}
            thumbColor={form.international ? colors.gold : '#888'}
          />
        </View>

        <Text style={styles.sectionK}>Buyer shipping options</Text>
        <Text style={styles.sectionHint}>
          Choose how much flexibility buyers get. Use “Choose services” to match USPS Ground + Priority but block
          overnight lanes.
        </Text>
        {SCOPE_OPTIONS.map((opt) => {
          const on = form.marketplaceShippingOfferScope === opt.id;
          return (
            <Pressable
              key={opt.id}
              style={[styles.scopeCard, on && styles.scopeCardOn]}
              onPress={() => setScope(opt.id)}
            >
              <View style={styles.scopeHead}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.gold : colors.textMuted} />
                <Text style={styles.scopeLbl}>{opt.label}</Text>
              </View>
              <Text style={styles.scopeSub}>{opt.sub}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.sectionK}>Live rate preview</Text>
        <Text style={styles.sectionHint}>
          Sample quotes for your parcel — buyers pay the option they select. Add ship-to ZIP for zone-accurate
          previews.
        </Text>
        {!packageReady ? (
          <Text style={styles.sectionHint}>Enter package weight, dimensions, and ship-from ZIP to load rates.</Text>
        ) : null}
        {offerablePreview.length > 0 ? (
          <Text style={styles.summaryLine}>
            {form.marketplaceOfferableRateCount} carrier option{form.marketplaceOfferableRateCount !== 1 ? 's' : ''} will be
            offered at checkout.
          </Text>
        ) : null}

        {previewCarriers.length > 0 ? (
          <View style={styles.carrierRow}>
            {previewCarriers.map((carrierKey) => {
              const on = form.marketplaceAllowedCarriers.includes(carrierKey);
              return (
                <Pressable
                  key={carrierKey}
                  style={[styles.carrierChip, on && styles.carrierChipOn]}
                  onPress={() => toggleCarrier(carrierKey)}
                >
                  <Text style={[styles.carrierChipTxt, on && styles.carrierChipTxtOn]}>
                    {marketplaceCarrierLabel(carrierKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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

        {!loading && rates.length > 0 && form.marketplaceOfferableRateCount === 0 ? (
          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={20} color={colors.gold} />
            <Text style={styles.warnTxt}>
              No services match your rules for this preview. Widen options or adjust the package — buyers need at least
              one choice.
            </Text>
          </View>
        ) : null}

        {!loading
          ? offerablePreview.map((rate) => (
              <RatePreviewCard
                key={marketplaceListingRateKey(rate)}
                rate={rate}
                mode="all"
                allowed
                excluded={false}
                handlingFee={handlingFee}
                onToggleAllowed={() => {}}
              />
            ))
          : null}

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.toggleLbl}>Shipping insurance</Text>
            <Text style={styles.toggleHint}>Optional add-on depends on carrier + declared value at label purchase.</Text>
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
        disabled={!canContinue}
      />
    </CreateListingChrome>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.md },
  callout: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(212,175,55,0.06)',
    alignItems: 'flex-start',
  },
  calloutTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  sectionK: { ...typography.micro, color: colors.gold, letterSpacing: 0.8, marginTop: spacing.sm },
  sectionHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  summaryLine: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  carrierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  carrierChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  carrierChipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  carrierChipTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  carrierChipTxtOn: { color: colors.gold },
  scopeCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    marginBottom: spacing.sm,
    gap: 4,
  },
  scopeCardOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.06)' },
  scopeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scopeLbl: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  scopeSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginLeft: 28 },
  fieldBlock: { gap: spacing.xs },
  fieldLbl: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sellerZipValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  sellerZipHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
    lineHeight: 17,
  },
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
  warnBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(212,175,55,0.05)',
    alignItems: 'flex-start',
  },
  warnTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
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
  rateCardMuted: { opacity: 0.7 },
  rateCardOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.05)' },
  rateHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkHit: { paddingTop: 2 },
  rateTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  rateEta: { color: colors.textSecondary, fontSize: 13 },
  ratePrice: { color: colors.gold, fontSize: 18, fontWeight: '800', marginTop: 2 },
  rateMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  rateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rateBadgeTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  rateMuted: { color: colors.textMuted, fontSize: 12 },
  rateIncl: { color: colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  rateExcl: { color: 'rgba(255,100,100,0.85)', fontSize: 11, marginTop: 6 },
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
