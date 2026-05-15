import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { TradeTrustStrip } from '../../components/trade/TradeTrustStrip';
import { TradeStatusBadge } from '../../components/trade/TradeStatusBadge';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../auth/AuthContext';
import { useTradeCenterFeed } from '../../hooks/useTradeCenterFeed';
import { areDevToolsEnabled } from '../../lib/devTools';
import { isSupabaseConfigured } from '../../lib/supabase';
import { navigateAuthLogin, navigateAuthSignUp } from '../../navigation/rootNavigationRef';
import { useTradeCenterDiagnostics } from '../../trade/TradeCenterDiagnosticsContext';
import type { TradeOfferVM } from '../../types/tradeOffers';

type Nav = NativeStackNavigationProp<TradeCenterStackParamList>;

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function profileHandle(p: { username: string | null; display_name: string | null }): string {
  if (p.username) return `@${p.username}`;
  return p.display_name ?? 'Collector';
}

function OfferRow({
  offer,
  userId,
  onPress,
}: {
  offer: TradeOfferVM;
  userId: string;
  onPress: () => void;
}) {
  const partner = offer.recipient_id === userId ? offer.sender : offer.recipient;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {profileHandle(partner)}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={2}>
          {offer.offered.map((i) => i.title).join(' · ')}
        </Text>
        <View style={{ marginTop: 6 }}>
          <TradeStatusBadge status={offer.status} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function TradeCenterHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, loading: authLoading, signOut } = useAuth();
  const diag = useTradeCenterDiagnostics();
  const onFeedRefreshed = useCallback(() => {
    diag?.markFeedRefreshed();
  }, [diag]);
  const { sections, loading, refreshing, source, refresh } = useTradeCenterFeed(user?.id, {
    onAfterRefresh: onFeedRefreshed,
  });
  const uid = user?.id;

  const goReview = (offerId: string) => navigation.navigate('ReviewOffer', { offerId });
  const firstIncoming = sections.incoming[0];

  const pulse = {
    incoming: sections.incoming.length,
    sent: sections.sent.length,
    counters: sections.counters.length,
    active: sections.active.length,
    completed: sections.completed.length,
  };

  const showDesk = isSupabaseConfigured() && Boolean(user) && !authLoading;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        <LinearGradient
          colors={['#1a1208', '#0a0906', '#050505']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroKicker}>Secure deal room</Text>
          <Text style={styles.heroTitle}>Trade Center</Text>
          <Text style={styles.heroBody}>
            Vault-to-vault offers, bundled trade fees, and live label status — wired to Supabase when you sign in.
          </Text>
        </LinearGradient>

        {!isSupabaseConfigured() ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Backend not configured</Text>
            <Text style={styles.warnBody}>
              Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Trade Center loads offers from your
              Supabase project — there is no offline trade desk in production builds.
            </Text>
            {areDevToolsEnabled() ? (
              <Pressable style={styles.qaLink} onPress={() => navigation.navigate('TradeCenterQa', undefined)}>
                <Text style={styles.qaLinkTxt}>Open QA tools</Text>
                <Ionicons name="flask-outline" size={18} color={colors.background} />
              </Pressable>
            ) : null}
          </View>
        ) : authLoading ? (
          <View style={styles.authCard}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : !user ? (
          <View style={styles.gateCard}>
            <Text style={styles.gateTitle}>Account required</Text>
            <Text style={styles.gateBody}>You need an account to start or review trades.</Text>
            <Pressable style={styles.authCta} onPress={navigateAuthSignUp}>
              <Text style={styles.authCtaTxt}>Create account</Text>
            </Pressable>
            <Pressable style={styles.authOut} onPress={navigateAuthLogin}>
              <Text style={styles.authOutTxt}>Log in</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>Account</Text>
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.authSigned}>Signed in · {user.email ?? user.id.slice(0, 8)}…</Text>
              <Text style={styles.sourceHint}>
                {source === 'live' ? 'Live trades from Supabase' : 'Connect to load your desk'}
              </Text>
              <Pressable style={styles.authOut} onPress={() => void signOut()}>
                <Text style={styles.authOutTxt}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        )}

        <TradeTrustStrip />

        {showDesk && firstIncoming ? (
          <View style={styles.notifCard}>
            <View style={styles.notifTop}>
              <Ionicons name="notifications-outline" size={18} color={colors.gold} />
              <Text style={styles.notifTitle}>Incoming trade</Text>
            </View>
            <Text style={styles.notifBody}>{profileHandle(firstIncoming.sender)} sent you an offer.</Text>
            <Pressable style={styles.notifCta} onPress={() => goReview(firstIncoming.id)}>
              <Text style={styles.notifCtaTxt}>Review offer</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.background} />
            </Pressable>
          </View>
        ) : null}

        {showDesk ? (
          <Pressable style={styles.startTrade} onPress={() => navigation.navigate('InitiateTrade')}>
            <LinearGradient colors={['#2a2418', '#12100c']} style={styles.startTradeInner}>
              <Ionicons name="add-circle-outline" size={22} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.startTradeTitle}>Start trade</Text>
                <Text style={styles.startTradeSub}>
                  Choose their live listing, your vault items, weight tier, and a note — offer lands in their inbox.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </LinearGradient>
          </Pressable>
        ) : null}

        {showDesk && uid ? (
          <>
            {loading ? (
              <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.gold} />
            ) : null}

            <View style={styles.pulseGrid}>
              <Pulse label="Incoming" value={pulse.incoming} />
              <Pulse label="Sent" value={pulse.sent} />
              <Pulse label="Counters" value={pulse.counters} />
              <Pulse label="Active" value={pulse.active} />
            </View>

            <SectionTitle title="Incoming offers" />
            {sections.incoming.length ? (
              sections.incoming.map((o) => (
                <OfferRow key={o.id} offer={o} userId={uid} onPress={() => goReview(o.id)} />
              ))
            ) : (
              <Text style={styles.empty}>No new offers — you are caught up.</Text>
            )}

            <SectionTitle title="Counter offers" />
            {sections.counters.length ? (
              sections.counters.map((o) => (
                <OfferRow key={o.id} offer={o} userId={uid} onPress={() => goReview(o.id)} />
              ))
            ) : (
              <Text style={styles.empty}>No counters on your desk.</Text>
            )}

            <SectionTitle title="Sent offers" />
            {sections.sent.length ? (
              sections.sent.map((o) => (
                <OfferRow key={o.id} offer={o} userId={uid} onPress={() => goReview(o.id)} />
              ))
            ) : (
              <Text style={styles.empty}>You have not sent an offer yet.</Text>
            )}

            <SectionTitle title="Active trades" />
            {sections.active.length ? (
              sections.active.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.row}
                  onPress={() => navigation.navigate('TradeDetail', { tradeId: t.id })}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>
                      {profileHandle(t.sender_id === uid ? t.recipient : t.sender)}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {t.requested.title}
                    </Text>
                    <View style={{ marginTop: 6 }}>
                      <TradeStatusBadge status={t.status} />
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.empty}>No active trades — accept an offer to move into fees & labels.</Text>
            )}

            <SectionTitle title="Completed trades" />
            {sections.completed.length ? (
              sections.completed.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.row}
                  onPress={() => navigation.navigate('TradeDetail', { tradeId: t.id })}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>
                      {profileHandle(t.sender_id === uid ? t.recipient : t.sender)}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      Completed · {t.requested.title}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.empty}>Completed trades archive will appear here.</Text>
            )}
          </>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

function Pulse({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.pulseCell}>
      <Text style={styles.pulseVal}>{value}</Text>
      <Text style={styles.pulseLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  scroll: { paddingBottom: spacing.xxl, gap: spacing.lg },
  hero: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.sm,
  },
  heroKicker: { ...typography.micro, color: colors.gold, letterSpacing: 1 },
  heroTitle: { ...typography.title, color: colors.textPrimary, fontSize: 24 },
  heroBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  authCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  authTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  authSigned: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  sourceHint: { color: colors.textMuted, fontSize: 12 },
  gateCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.md,
  },
  gateTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
  gateBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  authCta: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  authCtaTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
  authOut: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  authOutTxt: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  warnCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.06)',
    gap: spacing.sm,
  },
  warnTitle: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  warnBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  qaLink: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  qaLinkTxt: { color: colors.background, fontWeight: '800', fontSize: 14 },
  notifCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  notifTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notifTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  notifBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  notifCta: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  notifCtaTxt: { color: colors.background, fontWeight: '800', fontSize: 14 },
  startTrade: { borderRadius: radii.lg, overflow: 'hidden' },
  startTradeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  startTradeTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  startTradeSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  pulseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pulseCell: {
    flexGrow: 1,
    minWidth: '22%',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pulseVal: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  pulseLbl: { color: colors.textMuted, fontSize: 9, fontWeight: '700', marginTop: 4, textTransform: 'uppercase' },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: -spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  empty: {
    color: colors.textSecondary,
    fontSize: 13,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
});
