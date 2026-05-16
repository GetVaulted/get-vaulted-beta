import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { LISTING_FLOW_STEP } from '../../createListing/listingChannel';
import {
  getLiveProfile,
  LIVE_BUNDLE_WEIGHT_TIERS_OZ,
  LIVE_BUYER_SHIPPING_MESSAGES,
  LIVE_SHIPPING_PROFILES,
  liveShippingStepComplete,
} from '../../createListing/liveShowShipping';
import { useCreateListingDraft } from '../../createListing/CreateListingDraftContext';
import type { CreateListingStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { CreateListingChrome } from './CreateListingChrome';
import { useCreateListingFlow } from './createListingFlowHelpers';
import { useCreateListingNavigation } from './useCreateListingNavigation';

function Field({
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
  accentColor,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
  accentColor: string;
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
      <Pressable
        style={[styles.footNext, { backgroundColor: accentColor }, disabled && styles.footNextOff]}
        onPress={() => !disabled && onNext()}
        disabled={disabled}
      >
        <Text style={styles.footNextTxt}>Review</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.background} />
      </Pressable>
    </View>
  );
}

export function CreateListingLiveShippingScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingLiveShipping'>) {
  const { form, setForm } = useCreateListingDraft();
  const { channel, accent, totalSteps } = useCreateListingFlow();
  const { exitFlow, goBackStep } = useCreateListingNavigation();
  const profile = getLiveProfile(form.liveShippingProfileId);

  useEffect(() => {
    if (profile && !profile.internationalEligible && form.liveShipInternational) {
      setForm({ liveShipInternational: false });
    }
  }, [profile?.id, form.liveShipInternational, setForm, profile]);

  const stepDone = liveShippingStepComplete({
    liveShippingPreset: form.liveShippingPreset,
    liveShippingProfileId: form.liveShippingProfileId,
    liveShipFromZip: form.liveShipFromZip,
    liveBundleEligible: form.liveBundleEligible,
    liveAdvancedWeightLb: form.liveAdvancedWeightLb,
    liveAdvancedLengthIn: form.liveAdvancedLengthIn,
    liveAdvancedWidthIn: form.liveAdvancedWidthIn,
    liveAdvancedHeightIn: form.liveAdvancedHeightIn,
  });

  const applyProfile = (id: string) => {
    const p = getLiveProfile(id);
    if (!p) return;
    setForm({
      liveShippingProfileId: id,
      liveBundleEligible: p.bundleEligibleDefault,
      liveShipInternational: p.internationalEligible,
    });
  };

  const intlDisabled = profile ? !profile.internationalEligible : true;

  return (
    <CreateListingChrome
      step={LISTING_FLOW_STEP.live_show.shipping}
      total={totalSteps}
      channel={channel}
      title="Live shipping"
      subtitle="Pick a profile once — buyers get bundled checkout in the show. Full Shippo rates stay on marketplace listings."
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionK, { color: accent.primary }]}>Shipping mode</Text>
        <Text style={styles.sectionHint}>
          Simplified hides parcel math; Advanced unlocks exact weight and dimensions (carrier overrides map on the
          backend).
        </Text>
        <View style={styles.presetRow}>
          {(
            [
              { id: 'simplified' as const, label: 'Simplified', sub: 'Fast · recommended' },
              { id: 'advanced' as const, label: 'Advanced', sub: 'Custom weight & box' },
            ] as const
          ).map((p) => {
            const on = form.liveShippingPreset === p.id;
            return (
              <Pressable
                key={p.id}
                style={[styles.presetCard, on && { borderColor: accent.primary, backgroundColor: accent.fill }]}
                onPress={() => setForm({ liveShippingPreset: p.id })}
              >
                <Text style={[styles.presetLbl, on && { color: accent.primary }]}>{p.label}</Text>
                <Text style={styles.presetSub}>{p.sub}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionK, { color: accent.primary }]}>Shipping profile</Text>
        <Text style={styles.sectionHint}>
          Nominal weight drives buyer tier previews; final bundle weight is summed at checkout for the same buyer,
          show, and seller.
        </Text>
        {LIVE_SHIPPING_PROFILES.map((p) => {
          const on = form.liveShippingProfileId === p.id;
          return (
            <Pressable
              key={p.id}
              style={[styles.profileRow, on && { borderColor: accent.primary, backgroundColor: accent.fill }]}
              onPress={() => applyProfile(p.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.profileTitle}>{p.label}</Text>
                <Text style={styles.profileSub}>{p.subtitle}</Text>
                <Text style={styles.profileMeta}>
                  ~{p.nominalWeightOz} oz · bundle default {p.bundleEligibleDefault ? 'on' : 'off'} · max{' '}
                  {p.maxBundleQuantity} / bundle
                </Text>
              </View>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={on ? accent.primary : colors.textMuted}
              />
            </Pressable>
          );
        })}

        <Field
          label="Ship from ZIP"
          value={form.liveShipFromZip}
          onChange={(t) => setForm({ liveShipFromZip: t })}
          placeholder="94103"
          keyboardType="number-pad"
        />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.toggleLbl}>Bundle eligible</Text>
            <Text style={styles.toggleHint}>
              Same buyer + same live show + same seller — eligible items combine until weight crosses the next tier.
            </Text>
          </View>
          <Switch
            value={form.liveBundleEligible}
            onValueChange={(v) => setForm({ liveBundleEligible: v })}
            trackColor={{ false: '#333', true: `${accent.primary}70` }}
            thumbColor={form.liveBundleEligible ? accent.primary : '#888'}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.toggleLbl}>Ship internationally</Text>
            <Text style={styles.toggleHint}>
              {intlDisabled ? 'This profile is domestic-only.' : 'Buyers outside the domestic zone can purchase.'}
            </Text>
          </View>
          <Switch
            value={form.liveShipInternational && !intlDisabled}
            onValueChange={(v) => setForm({ liveShipInternational: v })}
            disabled={intlDisabled}
            trackColor={{ false: '#333', true: `${accent.primary}70` }}
            thumbColor={form.liveShipInternational && !intlDisabled ? accent.primary : '#888'}
          />
        </View>

        <Field
          label="Handling surcharge (optional)"
          value={form.liveHandlingSurcharge}
          onChange={(t) => setForm({ liveHandlingSurcharge: t })}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        {form.liveShippingPreset === 'advanced' && profile ? (
          <>
            <Text style={[styles.sectionK, { color: accent.primary }]}>Advanced package</Text>
            <Text style={styles.sectionHint}>
              Overrides profile defaults for Shippo label generation — sellers creating 100 lots rarely need this.
            </Text>
            <Field
              label="Total weight (lb)"
              value={form.liveAdvancedWeightLb}
              onChange={(t) => setForm({ liveAdvancedWeightLb: t })}
              placeholder="1.5"
              keyboardType="decimal-pad"
            />
            <View style={styles.dimRow}>
              <View style={styles.dimThird}>
                <Field
                  label="Length (in)"
                  value={form.liveAdvancedLengthIn}
                  onChange={(t) => setForm({ liveAdvancedLengthIn: t })}
                  placeholder="10"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.dimThird}>
                <Field
                  label="Width (in)"
                  value={form.liveAdvancedWidthIn}
                  onChange={(t) => setForm({ liveAdvancedWidthIn: t })}
                  placeholder="8"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.dimThird}>
                <Field
                  label="Height (in)"
                  value={form.liveAdvancedHeightIn}
                  onChange={(t) => setForm({ liveAdvancedHeightIn: t })}
                  placeholder="4"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </>
        ) : profile ? (
          <View style={[styles.summaryCard, { borderColor: accent.border }]}>
            <Text style={[styles.summaryK, { color: accent.primary }]}>Profile defaults (simplified)</Text>
            <Text style={styles.summaryBody}>
              Box ~{profile.defaultDimsIn.length} × {profile.defaultDimsIn.width} × {profile.defaultDimsIn.height} in ·
              nominal {profile.nominalWeightOz} oz — Shippo maps tiers underneath.
            </Text>
          </View>
        ) : null}

        <Text style={[styles.sectionK, { color: accent.primary }]}>Weight tiers (buyer bundle)</Text>
        <Text style={styles.tierLine}>
          {LIVE_BUNDLE_WEIGHT_TIERS_OZ.map((z) => z.label).join(' · ')}
        </Text>

        <Text style={[styles.sectionK, { color: accent.primary }]}>Buyer checkout copy</Text>
        <View style={[styles.msgCard, { borderColor: accent.border }]}>
          <Text style={styles.msgQuote}>{LIVE_BUYER_SHIPPING_MESSAGES.bundled}</Text>
          <Text style={styles.msgQuote}>{LIVE_BUYER_SHIPPING_MESSAGES.noExtraShipping}</Text>
          <Text style={styles.msgQuote}>{LIVE_BUYER_SHIPPING_MESSAGES.tierUpgrade}</Text>
          <Text style={[styles.msgQuote, styles.msgSep]}>{LIVE_BUYER_SHIPPING_MESSAGES.marketplaceSeparate}</Text>
        </View>
      </ScrollView>

      <Footer
        onBack={() => navigation.goBack()}
        onNext={() => navigation.navigate('CreateListingReview')}
        nextLabel="Review"
        disabled={!stepDone}
        accentColor={accent.primary}
      />
    </CreateListingChrome>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionK: { ...typography.micro, letterSpacing: 0.8, marginTop: spacing.sm },
  sectionHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  presetRow: { flexDirection: 'row', gap: spacing.sm },
  presetCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  presetLbl: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  presetSub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    marginBottom: spacing.sm,
  },
  profileTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  profileSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  profileMeta: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
  fieldBlock: { gap: spacing.xs },
  fieldLbl: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
  summaryCard: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
  },
  summaryK: { ...typography.micro, letterSpacing: 0.8 },
  summaryBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  tierLine: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  msgCard: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  msgQuote: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  msgSep: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 'auto', paddingVertical: spacing.lg },
  footBack: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  footBackTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  footNext: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
  },
  footNextOff: { opacity: 0.45 },
  footNextTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
});
