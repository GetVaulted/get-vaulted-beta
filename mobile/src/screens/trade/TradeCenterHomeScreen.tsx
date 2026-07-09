import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TradeCenterHero } from '../../components/trade/TradeCenterHero';
import { TradeDealCard } from '../../components/trade/TradeDealCard';
import { PremiumEmptyPanel } from '../../components/empty/PremiumEmptyPanel';
import { TradePulseStrip } from '../../components/trade/TradePulseStrip';
import { TradeSectionBlock } from '../../components/trade/TradeSectionBlock';
import { TradeStartDealCta } from '../../components/trade/TradeStartDealCta';
import { TradeTrustStrip } from '../../components/trade/TradeTrustStrip';
import { TradeBlockPanel } from '../../components/trade/TradeBlockPanel';
import { TradeCenterDeskTabs, type TradeCenterDeskTab } from '../../components/trade/TradeCenterDeskTabs';
import { useTradeCenterFeed } from '../../hooks/useTradeCenterFeed';
import { areDevToolsEnabled } from '../../lib/devTools';
import { isSupabaseConfigured } from '../../lib/supabase';
import { isWebTradeApiConfigured } from '../../api/tradeOffersWebApi';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { navigateAuthLogin, navigateAuthSignUp } from '../../navigation/rootNavigationRef';
import { useAuth } from '../../auth/AuthContext';
import { useTradeCenterDiagnostics } from '../../trade/TradeCenterDiagnosticsContext';
import type { TradeOfferVM } from '../../types/tradeOffers';
import { colors, radii, spacing } from '../../theme';
import { useMarketplaceLayout } from '../../hooks/useMarketplaceLayout';

type Nav = NativeStackNavigationProp<TradeCenterStackParamList>;

const START_STEPS = [
  'Pick your card from the vault',
  'Choose what you want in return',
  'Send a protected offer',
] as const;

function profileHandle(p: { username: string | null; display_name: string | null }): string {
  if (p.username) return `@${p.username}`;
  return p.display_name ?? 'Collector';
}

export function TradeCenterHomeScreen() {
  const insets = useSafeAreaInsets();
  const layout = useMarketplaceLayout();
  const navigation = useNavigation<Nav>();
  const { user, loading: authLoading } = useAuth();
  const diag = useTradeCenterDiagnostics();
  const onFeedRefreshed = useCallback(() => {
    diag?.markFeedRefreshed();
  }, [diag]);
  const { sections, loading, refreshing, source, refresh, participantUserId, feedError } = useTradeCenterFeed(user?.id, {
    onAfterRefresh: onFeedRefreshed,
  });
  const uid = participantUserId ?? user?.id;
  const initialTabSet = useRef(false);
  const [deskTab, setDeskTab] = useState<TradeCenterDeskTab>('start');

  const goReview = (offerId: string) => navigation.navigate('ReviewOffer', { offerId });
  const goTradeDetail = (tradeId: string) => navigation.navigate('TradeDetail', { tradeId });
  const startTrade = () => navigation.navigate('InitiateTrade');

  const firstIncoming = sections.incoming[0];
  const showDesk = (isWebTradeApiConfigured() || isSupabaseConfigured()) && Boolean(user) && !authLoading;
  const dealCount =
    sections.incoming.length +
    sections.counters.length +
    sections.sent.length +
    sections.active.length +
    sections.completed.length;
  const showDealsEmpty = showDesk && !loading && dealCount === 0;

  useEffect(() => {
    if (!showDesk || loading || initialTabSet.current) return;
    if (dealCount > 0 || sections.incoming.length > 0) {
      setDeskTab('block');
    }
    initialTabSet.current = true;
  }, [dealCount, loading, sections.incoming.length, showDesk]);

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
        contentContainerStyle={[styles.scroll, { paddingBottom: layout.tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        <TradeCenterHero />

        {!isWebTradeApiConfigured() && !isSupabaseConfigured() ? (
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

            {feedError ? (
              <View style={styles.warnCard}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.gold} />
                <Text style={styles.warnTitle}>Trade inbox could not refresh</Text>
                <Text style={styles.warnBody}>{feedError}</Text>
              </View>
            ) : null}

            <TradeCenterDeskTabs tab={deskTab} onTabChange={setDeskTab} blockCount={dealCount} />

            {deskTab === 'start' ? (
              <View style={styles.startPanel}>
                <TradeStartDealCta onPress={startTrade} />
                <TradeTrustStrip />
                <View style={styles.stepsCard}>
                  <Text style={styles.stepsTitle}>How it works</Text>
                  {START_STEPS.map((step, idx) => (
                    <View key={step} style={styles.stepRow}>
                      <View style={styles.stepNum}>
                        <Text style={styles.stepNumTxt}>{idx + 1}</Text>
                      </View>
                      <Text style={styles.stepTxt}>{step}</Text>
                    </View>
                  ))}
                </View>
                {dealCount > 0 ? (
                  <Pressable style={styles.viewBlockLink} onPress={() => setDeskTab('block')}>
                    <Text style={styles.viewBlockLinkTxt}>
                      View trade block ({dealCount} {dealCount === 1 ? 'deal' : 'deals'})
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.gold} />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <TradeBlockPanel>
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

                {showDealsEmpty ? (
                  <PremiumEmptyPanel
                    icon="swap-horizontal-outline"
                    title="No active collector deals."
                    subtitle="Send a protected offer from Start a trade — negotiations and shipping labels sync here."
                    actions={[{ label: 'Start a trade', onPress: () => setDeskTab('start') }]}
                  />
                ) : null}

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
                    Offers and negotiation threads live in your trade block — your private collector inbox for protected
                    trades.
                  </Text>
                </View>
              </TradeBlockPanel>
            )}
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
  startPanel: {
    gap: spacing.lg,
  },
  stepsCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.md,
  },
  stepsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
  },
  stepTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  viewBlockLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  viewBlockLinkTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gold,
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
