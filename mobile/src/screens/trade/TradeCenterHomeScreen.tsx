import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TradeCenterHero } from '../../components/trade/TradeCenterHero';
import { TradeDealCard } from '../../components/trade/TradeDealCard';
import { TradeMomentumRail } from '../../components/trade/TradeMomentumRail';
import { TradeNegotiationPulse } from '../../components/trade/TradeNegotiationPulse';
import { TradePulseStrip } from '../../components/trade/TradePulseStrip';
import { TradeSectionBlock } from '../../components/trade/TradeSectionBlock';
import { TradeStartDealCta } from '../../components/trade/TradeStartDealCta';
import { TradeTrustStrip } from '../../components/trade/TradeTrustStrip';
import { tradeNegotiationPulse, tradeRecentDeals } from '../../data/tradeCenterMock';
import { useTradeCenterFeed } from '../../hooks/useTradeCenterFeed';
import { areDevToolsEnabled } from '../../lib/devTools';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { navigateAuthLogin, navigateAuthSignUp } from '../../navigation/rootNavigationRef';
import { useAuth } from '../../auth/AuthContext';
import { useTradeCenterDiagnostics } from '../../trade/TradeCenterDiagnosticsContext';
import type { TradeOfferVM } from '../../types/tradeOffers';
import { colors, radii, spacing } from '../../theme';

type Nav = NativeStackNavigationProp<TradeCenterStackParamList>;

function profileHandle(p: { username: string | null; display_name: string | null }): string {
  if (p.username) return `@${p.username}`;
  return p.display_name ?? 'Collector';
}

export function TradeCenterHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, loading: authLoading } = useAuth();
  const diag = useTradeCenterDiagnostics();
  const onFeedRefreshed = useCallback(() => {
    diag?.markFeedRefreshed();
  }, [diag]);
  const { sections, loading, refreshing, source, refresh } = useTradeCenterFeed(user?.id, {
    onAfterRefresh: onFeedRefreshed,
  });
  const uid = user?.id;

  const goReview = (offerId: string) => navigation.navigate('ReviewOffer', { offerId });
  const goTradeDetail = (tradeId: string) => navigation.navigate('TradeDetail', { tradeId });
  const startTrade = () => navigation.navigate('InitiateTrade');

  const firstIncoming = sections.incoming[0];
  const showDesk = isSupabaseConfigured() && Boolean(user) && !authLoading;

  const renderOffer = (offer: TradeOfferVM, viewerId: string) => {
    const partner = offer.recipient_id === viewerId ? offer.sender : offer.recipient;
    return (
      <TradeDealCard
        key={offer.id}
        partner={partner}
        status={offer.status}
        requested={offer.requested}
        offered={offer.offered}
        messagePreview={offer.message}
        onPress={() => goReview(offer.id)}
      />
    );
  };

  const renderActiveTrade = (offer: TradeOfferVM, viewerId: string) => {
    const partner = offer.recipient_id === viewerId ? offer.sender : offer.recipient;
    return (
      <TradeDealCard
        key={offer.id}
        partner={partner}
        status={offer.status}
        requested={offer.requested}
        offered={offer.offered}
        onPress={() => goTradeDetail(offer.id)}
      />
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        <TradeCenterHero />

        {!isSupabaseConfigured() ? (
          <View style={styles.warnCard}>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.gold} />
            <Text style={styles.warnTitle}>Trade network unavailable</Text>
            <Text style={styles.warnBody}>
              Connect your vault to sync offers, negotiations, and protected shipping labels.
            </Text>
            {areDevToolsEnabled() ? (
              <Pressable style={styles.qaLink} onPress={() => navigation.navigate('TradeCenterQa', undefined)}>
                <Text style={styles.qaLinkTxt}>Developer tools</Text>
              </Pressable>
            ) : null}
          </View>
        ) : authLoading ? (
          <Text style={styles.syncHint}>Loading your collector account…</Text>
        ) : !user ? (
          <View style={styles.gateCard}>
            <Text style={styles.gateTitle}>Join the collector network</Text>
            <Text style={styles.gateBody}>
              Send protected offers, negotiate privately, and trade premium inventory with verified collectors.
            </Text>
            <Pressable style={styles.authCta} onPress={navigateAuthSignUp}>
              <Text style={styles.authCtaTxt}>Create account</Text>
            </Pressable>
            <Pressable style={styles.authOut} onPress={navigateAuthLogin}>
              <Text style={styles.authOutTxt}>Log in</Text>
            </Pressable>
          </View>
        ) : null}

        {showDesk ? (
          <>
            {source === 'live' ? (
              <Text style={styles.syncHint}>Synced to your vault</Text>
            ) : (
              <Text style={styles.syncHint}>Connecting to your trade desk…</Text>
            )}

            <TradeStartDealCta onPress={startTrade} />

            {firstIncoming ? (
              <Pressable style={styles.incomingBanner} onPress={() => goReview(firstIncoming.id)}>
                <View style={styles.incomingIcon}>
                  <Ionicons name="mail-unread-outline" size={20} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.incomingTitle}>Incoming offer</Text>
                  <Text style={styles.incomingBody} numberOfLines={1}>
                    {profileHandle(firstIncoming.sender)} wants to negotiate
                  </Text>
                </View>
                <Text style={styles.incomingCta}>Review</Text>
              </Pressable>
            ) : null}

            <TradePulseStrip
              items={[
                { label: 'Incoming', value: sections.incoming.length, accent: sections.incoming.length > 0 },
                { label: 'Active', value: sections.active.length, accent: sections.active.length > 0 },
                { label: 'Sent', value: sections.sent.length },
                { label: 'Done', value: sections.completed.length },
              ]}
            />

            <TradeTrustStrip />

            <TradeMomentumRail title="Recent vault trades" items={tradeRecentDeals} />
            <TradeNegotiationPulse items={tradeNegotiationPulse} />

            {loading && !sections.incoming.length && !sections.active.length ? (
              <Text style={styles.syncHint}>Loading your deals…</Text>
            ) : null}

            <TradeSectionBlock
              title="Incoming offers"
              count={sections.incoming.length}
              emptyTitle="No incoming offers yet."
              emptyHint="Protected offers from collectors appear here."
            >
              {uid ? sections.incoming.map((o) => renderOffer(o, uid)) : null}
            </TradeSectionBlock>

            <TradeSectionBlock
              title="Counter offers"
              count={sections.counters.length}
              emptyTitle="No active negotiations."
            >
              {uid ? sections.counters.map((o) => renderOffer(o, uid)) : null}
            </TradeSectionBlock>

            <TradeSectionBlock
              title="Sent offers"
              count={sections.sent.length}
              emptyTitle="No sent offers yet."
            >
              {uid ? sections.sent.map((o) => renderOffer(o, uid)) : null}
            </TradeSectionBlock>

            <TradeSectionBlock
              title="Active trades"
              count={sections.active.length}
              emptyTitle="No active deals."
            >
              {uid ? sections.active.map((o) => renderActiveTrade(o, uid)) : null}
            </TradeSectionBlock>

            <TradeSectionBlock
              title="Completed trades"
              count={sections.completed.length}
              emptyTitle="Your collector reputation builds here."
            >
              {uid ? sections.completed.map((o) => renderActiveTrade(o, uid)) : null}
            </TradeSectionBlock>

            <View style={styles.inboxNote}>
              <Ionicons name="chatbubbles-outline" size={18} color={colors.gold} />
              <Text style={styles.inboxNoteTxt}>
                Offers and negotiation threads will live here — your private collector inbox for protected trades.
              </Text>
            </View>
          </>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  syncHint: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.2,
    marginTop: -spacing.sm,
  },
  warnCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.06)',
    gap: spacing.sm,
  },
  warnTitle: { color: colors.gold, fontWeight: '800', fontSize: 15 },
  warnBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  qaLink: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
  },
  qaLinkTxt: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  gateCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.md,
  },
  gateTitle: { color: colors.textPrimary, fontWeight: '900', fontSize: 18 },
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
  incomingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  incomingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(212,175,55,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  incomingBody: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
  },
  incomingCta: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gold,
  },
  inboxNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.2)',
    backgroundColor: 'rgba(212,175,55,0.04)',
  },
  inboxNoteTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 17,
  },
});
