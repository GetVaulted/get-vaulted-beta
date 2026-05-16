import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import type { SellerConnectStatusResponse } from '../../api/stripeConnectRepository';
import { streamCategories } from '../../data/sellerHubMock';
import { colors, radii, spacing } from '../../theme';
import type { CategoryId } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type VaultEventTypeId = 'standard' | 'premium_auction' | 'card_break' | 'vault_drop' | 'private_collector';

const EVENT_TYPES: {
  id: VaultEventTypeId;
  title: string;
  subtitle: string;
  format: 'auction' | 'break' | 'hybrid';
}[] = [
  { id: 'standard', title: 'Standard live', subtitle: 'Classic lane · chat-first', format: 'hybrid' },
  { id: 'premium_auction', title: 'Premium auction night', subtitle: 'Hammer-led · high polish', format: 'auction' },
  { id: 'card_break', title: 'Card break', subtitle: 'Spots · reveals · lane control', format: 'break' },
  { id: 'vault_drop', title: 'Vault drop', subtitle: 'Timed release · scarcity', format: 'hybrid' },
  { id: 'private_collector', title: 'Private collector event', subtitle: 'Invite-only · intimate room', format: 'hybrid' },
];

export type LaunchVaultEventPanelProps = {
  sellerConnect: { status: SellerConnectStatusResponse | null; loading: boolean };
  scheduleTitle: string;
  setScheduleTitle: (s: string) => void;
  scheduleCategory: CategoryId;
  setScheduleCategory: (c: CategoryId) => void;
  streamFormat: 'auction' | 'break' | 'hybrid';
  setStreamFormat: (f: 'auction' | 'break' | 'hybrid') => void;
  preloadInventory: boolean;
  setPreloadInventory: (v: boolean) => void;
  giveaways: boolean;
  setGiveaways: (v: boolean) => void;
  onBrowseLive: () => void;
  sellerDisplayName: string;
  sellerHandle: string;
  sellerAvatarUrl?: string | null;
  vaultListingCount: number;
};

function SectionCard({
  kicker,
  title,
  hint,
  defaultOpen,
  children,
}: {
  kicker: string;
  title: string;
  hint?: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  }, []);
  return (
    <View style={s.sectionShell}>
      <Pressable onPress={toggle} style={s.sectionHeader} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={s.sectionKicker}>{kicker}</Text>
          <Text style={s.sectionTitle}>{title}</Text>
          {hint ? <Text style={s.sectionHint}>{hint}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? <View style={s.sectionBody}>{children}</View> : null}
    </View>
  );
}

function ToggleLuxury({
  label,
  sub,
  value,
  onToggle,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <Pressable style={s.toggleLux} onPress={() => onToggle(!value)}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLuxLabel}>{label}</Text>
        {sub ? <Text style={s.toggleLuxSub}>{sub}</Text> : null}
      </View>
      <View style={[s.toggleLuxKnob, value && s.toggleLuxKnobOn]}>
        <View style={[s.toggleLuxDot, value && s.toggleLuxDotOn]} />
      </View>
    </Pressable>
  );
}

export function LaunchVaultEventPanel(props: LaunchVaultEventPanelProps) {
  const liveBlocked =
    props.sellerConnect.status?.stripeConfigured === true && props.sellerConnect.status.can_host_live_sales === false;

  const [tagline, setTagline] = useState('');
  const [whatsDropping, setWhatsDropping] = useState('');
  const [eventType, setEventType] = useState<VaultEventTypeId>('standard');
  const [scheduledAt, setScheduledAt] = useState('Select date & time');
  const [instantLive, setInstantLive] = useState(false);
  const [access, setAccess] = useState<'public' | 'private' | 'invite'>('public');
  const [auctionsEnabled, setAuctionsEnabled] = useState(true);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [buyNowEnabled, setBuyNowEnabled] = useState(true);
  const [breakMode, setBreakMode] = useState(false);
  const [shippingProfile, setShippingProfile] = useState('Default Vault profile');
  const [bundleShip, setBundleShip] = useState(true);
  const [intlShip, setIntlShip] = useState(false);
  const [localPickup, setLocalPickup] = useState(false);
  const [slowMode, setSlowMode] = useState(false);
  const [pushNotify, setPushNotify] = useState(true);
  const [featuredRequest, setFeaturedRequest] = useState(false);
  const [countdownBanner, setCountdownBanner] = useState(true);
  const [reminderNotify, setReminderNotify] = useState(true);
  const [maxViewers, setMaxViewers] = useState('');
  const [sellerNotes, setSellerNotes] = useState('');

  const applyEventType = useCallback(
    (id: VaultEventTypeId) => {
      setEventType(id);
      const row = EVENT_TYPES.find((e) => e.id === id);
      if (row) props.setStreamFormat(row.format);
    },
    [props],
  );

  const categoryLabel = useMemo(
    () => streamCategories.find((c) => c.id === props.scheduleCategory)?.label ?? 'Vault',
    [props.scheduleCategory],
  );

  const previewTitle = props.scheduleTitle.trim() || 'Untitled Vault event';
  const previewSub = tagline.trim() || 'Curated drops · live lane';
  const liveLabel = instantLive ? 'LIVE' : 'SCHEDULED';
  const viewerPlaceholder = '—';

  const onLiveHub = () => {
    if (liveBlocked) {
      Alert.alert(
        'Payout setup required',
        'Finish Stripe Connect onboarding in Seller HQ before hosting live events — drafts stay available.',
      );
      return;
    }
    props.onBrowseLive();
  };

  const onVaultAi = () => {
    props.setScheduleTitle('Nocturne Vault Session');
    setTagline('Sealed slabs · chase lots · one reserved grail');
    setWhatsDropping('Tonight: vintage wax, numbered parallels, and a single-owner consignment block.');
  };

  return (
    <View style={s.scroll}>
      <View style={s.previewWrap}>
        <LinearGradient
          colors={['rgba(212,175,55,0.22)', 'rgba(8,8,10,0.96)', colors.surfaceElevated]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.previewGradient}
        >
          <View style={s.previewTopRow}>
            <View style={s.previewThumb}>
              <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.45)']} style={StyleSheet.absoluteFill} />
              <Ionicons name="diamond-outline" size={28} color={colors.gold} style={{ opacity: 0.85 }} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.previewBadgeRow}>
                <View style={[s.livePill, instantLive ? s.livePillHot : s.livePillSoft]}>
                  <Text style={[s.livePillTxt, instantLive && s.livePillTxtHot]}>{liveLabel}</Text>
                </View>
                <View style={s.catPill}>
                  <Text style={s.catPillTxt}>{categoryLabel}</Text>
                </View>
              </View>
              <Text style={s.previewTitle} numberOfLines={2}>
                {previewTitle}
              </Text>
              <Text style={s.previewSub} numberOfLines={2}>
                {previewSub}
              </Text>
              <View style={s.previewMetaRow}>
                {props.sellerAvatarUrl ? (
                  <Image source={{ uri: props.sellerAvatarUrl }} style={s.previewAvatar} />
                ) : (
                  <View style={[s.previewAvatar, s.previewAvatarPh]}>
                    <Ionicons name="person" size={18} color={colors.gold} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.previewHost} numberOfLines={1}>
                    {props.sellerDisplayName}
                  </Text>
                  <Text style={s.previewHandle} numberOfLines={1}>
                    {props.sellerHandle}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <View style={s.previewFooter}>
            <Text style={s.previewWhen}>{instantLive ? 'Starting now · vault lane primed' : scheduledAt}</Text>
            <Text style={s.previewViewers}>
              {viewerPlaceholder} <Text style={s.previewViewersEm}>in the room</Text>
            </Text>
          </View>
        </LinearGradient>
      </View>

      <View style={s.heroCtaRow}>
        <Pressable style={[s.goLiveNow, liveBlocked && s.goLiveOff]} onPress={onLiveHub}>
          <LinearGradient
            colors={liveBlocked ? ['#333', '#222'] : ['#E8C547', colors.gold, '#B8922A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.goLiveGrad}
          >
            <Ionicons name="flash-outline" size={22} color={liveBlocked ? colors.textMuted : colors.background} />
            <Text style={[s.goLiveTxt, liveBlocked && s.goLiveTxtOff]}>Go live now</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={[s.hubBtn, liveBlocked && s.hubBtnOff]} onPress={onLiveHub}>
          <Text style={[s.hubBtnTxt, liveBlocked && s.hubBtnTxtOff]}>Open live hub</Text>
        </Pressable>
      </View>

      <Text style={s.pageEyebrow}>Creator studio</Text>
      <Text style={s.pageTitle}>Launch a Vault event</Text>
      <Text style={s.pageSub}>Design the room like a private release — then take the lane when you are ready.</Text>

      <SectionCard kicker="A" title="Show identity" hint="Name the moment. This is what collectors feel before they tap in." defaultOpen>
        <Text style={s.fieldLabel}>Event title</Text>
        <TextInput
          value={props.scheduleTitle}
          onChangeText={props.setScheduleTitle}
          placeholder="e.g. Nocturne wax · Session XII"
          placeholderTextColor={colors.textMuted}
          style={s.inputLux}
        />
        <Text style={s.fieldLabel}>Subtitle / tagline</Text>
        <TextInput
          value={tagline}
          onChangeText={setTagline}
          placeholder="One line of promise"
          placeholderTextColor={colors.textMuted}
          style={s.inputLux}
        />
        <Text style={s.fieldLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {streamCategories.map((c) => {
            const on = props.scheduleCategory === c.id;
            return (
              <Pressable key={c.id} onPress={() => props.setScheduleCategory(c.id)} style={[s.chipLux, on && s.chipLuxOn]}>
                <Text style={[s.chipLuxTxt, on && s.chipLuxTxtOn]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={s.fieldLabel}>Cover & trailer</Text>
        <View style={s.mediaRow}>
          <Pressable style={s.mediaTile}>
            <Ionicons name="image-outline" size={22} color={colors.gold} />
            <Text style={s.mediaTileTxt}>Cover art</Text>
          </Pressable>
          <Pressable style={s.mediaTile}>
            <Ionicons name="film-outline" size={22} color={colors.gold} />
            <Text style={s.mediaTileTxt}>Trailer clip</Text>
          </Pressable>
        </View>
        <Text style={s.fieldLabel}>What is dropping?</Text>
        <TextInput
          value={whatsDropping}
          onChangeText={setWhatsDropping}
          placeholder="Short tease — slabs, singles, chase lots…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[s.inputLux, s.inputTall]}
        />
        <Pressable style={s.aiRow} onPress={onVaultAi}>
          <Ionicons name="sparkles-outline" size={18} color={colors.gold} />
          <Text style={s.aiRowTxt}>Generate title & description with Vault AI</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </SectionCard>

      <SectionCard kicker="Event format" title="Choose your lane" hint="Each format opens different controls in the live hub." defaultOpen>
        <View style={s.eventGrid}>
          {EVENT_TYPES.map((e) => {
            const on = eventType === e.id;
            return (
              <Pressable key={e.id} onPress={() => applyEventType(e.id)} style={[s.eventCard, on && s.eventCardOn]}>
                <Text style={[s.eventCardTitle, on && s.eventCardTitleOn]}>{e.title}</Text>
                <Text style={s.eventCardSub}>{e.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard kicker="B" title="Schedule & access" hint="Time the drop — or flip the room on instantly." defaultOpen>
        <ToggleLuxury
          label="Instant live"
          sub="Skip the countdown — vault lane opens the moment you confirm."
          value={instantLive}
          onToggle={setInstantLive}
        />
        <Pressable style={s.dateRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.gold} />
          <Text style={s.dateRowTxt}>{scheduledAt}</Text>
          <Text style={s.dateRowHint}>Calendar sync coming soon</Text>
        </Pressable>
        <Text style={s.fieldLabel}>Access</Text>
        <View style={s.accessRow}>
          {(
            [
              { id: 'public' as const, label: 'Public', sub: 'Discoverable' },
              { id: 'private' as const, label: 'Private', sub: 'Link only' },
              { id: 'invite' as const, label: 'Invite-only', sub: 'Guest list' },
            ] as const
          ).map((a) => {
            const on = access === a.id;
            return (
              <Pressable key={a.id} onPress={() => setAccess(a.id)} style={[s.accessChip, on && s.accessChipOn]}>
                <Text style={[s.accessChipTitle, on && s.accessChipTitleOn]}>{a.label}</Text>
                <Text style={s.accessChipSub}>{a.sub}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.fieldMuted}>Subscriber-only & VIP lanes ship in a later Vault drop.</Text>
      </SectionCard>

      <SectionCard kicker="C" title="Inventory & format" hint="Fine-tune how inventory moves on-air." defaultOpen={false}>
        {props.vaultListingCount > 0 ? (
          <View style={s.intelBanner}>
            <Ionicons name="cube-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={s.intelTitle}>Pull from your Vault inventory</Text>
              <Text style={s.intelBody}>
                You have {props.vaultListingCount} listing{props.vaultListingCount === 1 ? '' : 's'} — add them to the
                pinned lane in the live hub after you launch.
              </Text>
            </View>
          </View>
        ) : (
          <Text style={s.fieldMuted}>List pieces in Vault first — then wire them to this event from the live hub.</Text>
        )}
        <ToggleLuxury label="Auctions enabled" value={auctionsEnabled} onToggle={setAuctionsEnabled} />
        <ToggleLuxury label="Sudden death auctions" sub="No overtime on hammer" value={suddenDeath} onToggle={setSuddenDeath} />
        <ToggleLuxury label="Buy now lane" value={buyNowEnabled} onToggle={setBuyNowEnabled} />
        <ToggleLuxury label="Giveaway mode" sub="Heat rounds & vault gifts" value={props.giveaways} onToggle={props.setGiveaways} />
        <ToggleLuxury label="Breaks mode" sub="Coming soon — lane presets reserved" value={breakMode} onToggle={setBreakMode} />
        <ToggleLuxury
          label="Preload inventory to pinned lane"
          sub="Keeps your hero lots ready before you are on camera."
          value={props.preloadInventory}
          onToggle={props.setPreloadInventory}
        />
      </SectionCard>

      <SectionCard kicker="D" title="Shipping setup" hint="Bundles and pickup polish the checkout story." defaultOpen={false}>
        <Pressable style={s.selectRow}>
          <Text style={s.selectLabel}>Shipping profile</Text>
          <Text style={s.selectValue}>{shippingProfile}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        <ToggleLuxury label="Bundle shipping" sub="One label when guests buy multiple lots" value={bundleShip} onToggle={setBundleShip} />
        <ToggleLuxury label="International shipping" value={intlShip} onToggle={setIntlShip} />
        <ToggleLuxury label="Local pickup" sub="VIP handoff — optional" value={localPickup} onToggle={setLocalPickup} />
      </SectionCard>

      <SectionCard kicker="E" title="Moderation & safety" hint="Quiet the room before it gets loud." defaultOpen={false}>
        <Pressable style={s.selectRow}>
          <Text style={s.selectLabel}>Moderators</Text>
          <Text style={s.selectValue}>Add in live hub</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={s.selectRow} onPress={() => {}}>
          <Text style={s.selectLabel}>Muted words</Text>
          <Text style={s.selectValue}>Configure in live hub</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={s.selectRow} onPress={() => {}}>
          <Text style={s.selectLabel}>Chat rules</Text>
          <Text style={s.selectValue}>Followers-only, links, caps…</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        <ToggleLuxury label="Slow mode" value={slowMode} onToggle={setSlowMode} />
        <Text style={s.fieldLabel}>Seller notes (internal)</Text>
        <TextInput
          value={sellerNotes}
          onChangeText={setSellerNotes}
          placeholder="Private cues for your mod team…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[s.inputLux, s.inputTall]}
        />
      </SectionCard>

      <SectionCard kicker="F" title="Promotion" hint="Visibility, not noise." defaultOpen={false}>
        <ToggleLuxury label="Push notification" sub="Notify followers when the room opens" value={pushNotify} onToggle={setPushNotify} />
        <ToggleLuxury label="Featured show request" sub="Editorial placement — subject to review" value={featuredRequest} onToggle={setFeaturedRequest} />
        <ToggleLuxury label="Countdown banner" value={countdownBanner} onToggle={setCountdownBanner} />
        <ToggleLuxury label="Reminder notifications" value={reminderNotify} onToggle={setReminderNotify} />
        <Text style={s.fieldLabel}>Social share preview</Text>
        <View style={s.sharePreview}>
          <Text style={s.sharePreviewTxt} numberOfLines={3}>
            {previewTitle} · {previewSub}
          </Text>
        </View>
        <Text style={s.fieldLabel}>Max viewers (optional)</Text>
        <TextInput
          value={maxViewers}
          onChangeText={setMaxViewers}
          placeholder="Leave open for uncapped"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          style={s.inputLux}
        />
        <Text style={s.fieldMuted}>Invite-only rooms & VIP tiers arrive in a future Vault release.</Text>
      </SectionCard>

      <Text style={s.sectionLabelRooms}>Your rooms</Text>
      <Text style={s.emptyShowsLux}>
        No Vault events on the calendar yet. When you publish from the live hub, they appear here — curated, not cluttered.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl * 2, gap: spacing.lg },
  previewWrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  previewGradient: { padding: spacing.lg, gap: spacing.md },
  previewTopRow: { flexDirection: 'row', gap: spacing.md },
  previewThumb: {
    width: 88,
    height: 110,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  previewBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  livePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  livePillHot: { backgroundColor: colors.liveGlow },
  livePillSoft: { backgroundColor: 'rgba(255,255,255,0.08)' },
  livePillTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: colors.textMuted },
  livePillTxtHot: { color: colors.live },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  catPillTxt: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 0.6 },
  previewTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginTop: 4,
  },
  previewSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  previewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  previewAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(212,175,55,0.4)' },
  previewAvatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(212,175,55,0.12)' },
  previewHost: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  previewHandle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  previewFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewWhen: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, flex: 1 },
  previewViewers: { fontSize: 11, color: colors.textMuted },
  previewViewersEm: { fontWeight: '700', color: colors.gold },
  heroCtaRow: { gap: spacing.sm },
  goLiveNow: { borderRadius: radii.lg, overflow: 'hidden' },
  goLiveOff: { opacity: 0.55 },
  goLiveGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
  },
  goLiveTxt: { fontSize: 17, fontWeight: '900', color: colors.background, letterSpacing: 0.2 },
  goLiveTxtOff: { color: colors.textMuted },
  hubBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  hubBtnOff: { opacity: 0.5 },
  hubBtnTxt: { fontSize: 14, fontWeight: '800', color: colors.gold },
  hubBtnTxtOff: { color: colors.textMuted },
  pageEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    color: colors.goldMuted,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  pageTitle: { fontSize: 26, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5, marginTop: 4 },
  pageSub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.sm },
  sectionShell: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: colors.gold, marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  sectionHint: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  sectionBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted },
  fieldMuted: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  inputLux: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    fontSize: 15,
  },
  inputTall: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.md },
  chipRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 4 },
  chipLux: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  chipLuxOn: {
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  chipLuxTxt: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  chipLuxTxtOn: { color: colors.gold },
  mediaRow: { flexDirection: 'row', gap: spacing.sm },
  mediaTile: {
    flex: 1,
    minHeight: 72,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    backgroundColor: 'rgba(212,175,55,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mediaTileTxt: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  aiRowTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.gold },
  eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  eventCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  eventCardOn: {
    borderColor: 'rgba(212,175,55,0.5)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  eventCardTitle: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  eventCardTitleOn: { color: colors.textPrimary },
  eventCardSub: { fontSize: 11, color: colors.textMuted, marginTop: 4, lineHeight: 15 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  dateRowTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  dateRowHint: { fontSize: 10, color: colors.textMuted },
  accessRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  accessChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minWidth: '30%',
    flexGrow: 1,
  },
  accessChipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  accessChipTitle: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  accessChipTitleOn: { color: colors.textPrimary },
  accessChipSub: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  intelBanner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  intelTitle: { fontSize: 14, fontWeight: '800', color: colors.gold },
  intelBody: { fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 17 },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  selectLabel: { fontSize: 12, color: colors.textMuted, width: 120 },
  selectValue: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  sharePreview: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sharePreviewTxt: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  toggleLux: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  toggleLuxLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  toggleLuxSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  toggleLuxKnob: {
    width: 48,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleLuxKnobOn: { borderColor: 'rgba(212,175,55,0.5)', backgroundColor: 'rgba(212,175,55,0.15)' },
  toggleLuxDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'flex-start',
  },
  toggleLuxDotOn: { alignSelf: 'flex-end', backgroundColor: colors.gold },
  sectionLabelRooms: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  emptyShowsLux: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
});
