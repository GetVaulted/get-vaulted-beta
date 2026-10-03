import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  QA_FORCEABLE_TRADE_STATUSES,
  devForceTradeOfferStatus,
  devTriggerTradeLabelError,
  fetchMyLiveListings,
  fetchTradeOfferById,
  insertQaPlaceholderListingForCurrentUser,
  qaCreateIncomingDemoTrade,
  qaMockLabelsGeneratedPipeline,
  qaSeedPartnerListingViaRpc,
} from '../../api/tradeOffersRepository';
import { useAuth } from '../../auth/AuthContext';
import { TradeFlowHeader } from '../../components/trade/TradeFlowHeader';
import { TradeStatusBadge } from '../../components/trade/TradeStatusBadge';
import { areDevToolsEnabled, getTradeDemoPartnerUserId } from '../../lib/devTools';
import { getNetlifyFunctionsBase, postTradeFeeCheckout } from '../../lib/netlifyFunctions';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { useTradeCenterDiagnostics } from '../../trade/TradeCenterDiagnosticsContext';
import { runTradeQaSetupChecks, type QaSetupCheckResult, type QaSetupStatus } from '../../trade/tradeQaSetupChecklist';
import { colors, radii, spacing, typography } from '../../theme';
import type { TradeOfferStatus, TradeOfferVM } from '../../types/tradeOffers';

type Props = NativeStackScreenProps<TradeCenterStackParamList, 'TradeCenterQa'>;

export function TradeCenterQaToolsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const diag = useTradeCenterDiagnostics();
  const [tradeId, setTradeId] = useState('');
  const [offer, setOffer] = useState<TradeOfferVM | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRealtime, setLastRealtime] = useState<string | null>(null);
  const [setupChecks, setSetupChecks] = useState<QaSetupCheckResult[]>([]);
  const [setupChecking, setSetupChecking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const uid = user?.id ?? null;

  const refreshSetupChecks = useCallback(async () => {
    setSetupChecking(true);
    try {
      const rows = await runTradeQaSetupChecks(uid);
      setSetupChecks(rows);
    } catch (e) {
      setSetupChecks([
        {
          key: 'runner_error',
          title: 'Could not run setup checks',
          status: 'test_failed',
          detail: e instanceof Error ? e.message : 'Unknown error',
        },
      ]);
    } finally {
      setSetupChecking(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      const fid = route.params?.focusTradeId;
      if (fid) setTradeId(fid);
      if (areDevToolsEnabled()) void refreshSetupChecks();
    }, [route.params?.focusTradeId, refreshSetupChecks]),
  );

  const reloadOffer = useCallback(async () => {
    const id = tradeId.trim();
    if (!id) {
      setOffer(null);
      return;
    }
    setOfferLoading(true);
    try {
      const o = await fetchTradeOfferById(id);
      setOffer(o);
    } finally {
      setOfferLoading(false);
    }
  }, [tradeId]);

  useEffect(() => {
    void reloadOffer();
  }, [reloadOffer]);

  useEffect(() => {
    if (!uid || !isSupabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel('trade-qa-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_offers', filter: `sender_id=eq.${uid}` },
        (payload) => {
          setLastRealtime(
            `${payload.eventType} · ${(payload.new as { id?: string })?.id ?? (payload as { old?: { id?: string } }).old?.id ?? '?'} · ${new Date().toISOString()}`,
          );
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_offers', filter: `recipient_id=eq.${uid}` },
        (payload) => {
          setLastRealtime(
            `${payload.eventType} · ${(payload.new as { id?: string })?.id ?? (payload as { old?: { id?: string } }).old?.id ?? '?'} · ${new Date().toISOString()}`,
          );
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [uid]);

  const lastFeedRefresh = diag?.lastFeedRefreshAt;

  const onCreateIncomingDemo = async () => {
    if (!uid) {
      Alert.alert('Sign in', 'Sign in on Trade Center home first.');
      return;
    }
    const demo = getTradeDemoPartnerUserId();
    if (!demo) {
      Alert.alert(
        'Demo partner id',
        'Set EXPO_PUBLIC_TRADE_DEMO_PARTNER_USER_ID to a second account UUID that owns at least one live listing.',
      );
      return;
    }
    setBusy('demo');
    try {
      const mine = await fetchMyLiveListings(uid);
      const firstMine = mine[0];
      if (!firstMine) {
        Alert.alert('Your listings', 'You need at least one live listing (seller = you) for the incoming offer target.');
        return;
      }
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase is not configured');
      const { data: theirsRows, error: le } = await sb
        .from('listings')
        .select('id')
        .eq('seller_id', demo)
        .eq('status', 'live')
        .limit(1);
      if (le) throw new Error(le.message);
      const partnerListingId = theirsRows?.[0]?.id as string | undefined;
      if (!partnerListingId) {
        Alert.alert('Partner listings', 'Demo partner has no live listings to offer.');
        return;
      }
      const newId = await qaCreateIncomingDemoTrade({
        demoSenderId: demo,
        requestedListingId: firstMine.id,
        offeredListingIds: [partnerListingId],
      });
      setTradeId(newId);
      Alert.alert('Created', `Incoming demo trade id:\n${newId}`);
      await reloadOffer();
      await refreshSetupChecks();
    } catch (e) {
      Alert.alert('Create failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onCreateMyTestListing = async () => {
    if (!uid) {
      Alert.alert('Sign in', 'Sign in on Trade Center home first.');
      return;
    }
    setBusy('my_list');
    try {
      const id = await insertQaPlaceholderListingForCurrentUser(uid);
      Alert.alert('Listing created', id);
      await refreshSetupChecks();
    } catch (e) {
      Alert.alert('Create listing failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onCreatePartnerTestListing = async () => {
    const demo = getTradeDemoPartnerUserId();
    if (!uid) {
      Alert.alert('Sign in', 'Sign in first.');
      return;
    }
    if (!demo) {
      Alert.alert('Demo partner', 'Set EXPO_PUBLIC_TRADE_DEMO_PARTNER_USER_ID first.');
      return;
    }
    setBusy('partner_list');
    try {
      const id = await qaSeedPartnerListingViaRpc(demo);
      Alert.alert('Partner listing created', id);
      await refreshSetupChecks();
    } catch (e) {
      Alert.alert(
        'Partner listing failed',
        e instanceof Error ? e.message : 'Apply migration qa_seed_partner_trade_listing if missing.',
      );
    } finally {
      setBusy(null);
    }
  };

  const requireTradeId = () => {
    const id = tradeId.trim();
    if (!id) {
      Alert.alert('Trade id', 'Paste a trade / offer UUID or create a demo trade first.');
      return null;
    }
    return id;
  };

  const onForceStatus = async (st: TradeOfferStatus) => {
    const id = requireTradeId();
    if (!id) return;
    setBusy(`st:${st}`);
    try {
      await devForceTradeOfferStatus(id, st);
      await reloadOffer();
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onMockLabels = async () => {
    const id = requireTradeId();
    if (!id) return;
    setBusy('labels');
    try {
      await qaMockLabelsGeneratedPipeline(id);
      await reloadOffer();
      Alert.alert('Mock labels', 'Inserted QA shipping_labels for both parties and set status to labels_generated.');
    } catch (e) {
      Alert.alert('Mock labels failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onLabelError = async () => {
    const id = requireTradeId();
    if (!id) return;
    setBusy('label_err');
    try {
      await devTriggerTradeLabelError(id);
      await reloadOffer();
    } catch (e) {
      Alert.alert('Label error failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onStripeTest = async () => {
    if (!uid) {
      Alert.alert('Sign in', 'Sign in first.');
      return;
    }
    const id = requireTradeId();
    if (!id) return;
    if (!getNetlifyFunctionsBase()) {
      Alert.alert('Netlify', 'Set EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE.');
      return;
    }
    if (!offer) {
      Alert.alert('Trade', 'Could not load this trade. Reload or fix the UUID.');
      return;
    }
    if (offer.status !== 'fee_due') {
      Alert.alert('Not fee_due', 'Force status to fee_due first, then open test checkout.');
      return;
    }
    const amountCents = Math.max(100, Math.round(Number(offer.trade_fee) * 100));
    setBusy('stripe');
    try {
      const { url } = await postTradeFeeCheckout({ tradeOfferId: id, userId: uid, amountCents });
      await WebBrowser.openBrowserAsync(url);
      await reloadOffer();
    } catch (e) {
      Alert.alert('Checkout failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const feeHint = useMemo(() => {
    if (!offer) return null;
    return `Current status: ${offer.status}`;
  }, [offer]);

  if (!areDevToolsEnabled()) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <TradeFlowHeader navigation={navigation} title="Trade Center QA" subtitle="Unavailable" />
        <Text style={styles.caption}>
          QA tools only appear when EXPO_PUBLIC_ENABLE_DEV_TOOLS is set to 1 or true.
        </Text>
        <Pressable style={styles.secondary} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryTxt}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <TradeFlowHeader navigation={navigation} title="Trade Center QA" subtitle="Non-production tools" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.warn}>
          Dev-only panel. Requires Supabase migration qa_trade_seed RPCs for incoming demo + mock labels.
        </Text>

        <Text style={styles.h}>Setup checklist</Text>
        <View style={styles.checkCard}>
          <Text style={styles.checkIntro}>
            Run before trade flows. Rows show Ready, Missing, Needs setup, or Test failed.
          </Text>
          <View style={styles.checkActions}>
            <Pressable
              style={[styles.checkBtn, setupChecking && styles.btnDim]}
              disabled={setupChecking}
              onPress={() => void refreshSetupChecks()}
            >
              {setupChecking ? (
                <ActivityIndicator color={colors.gold} size="small" />
              ) : (
                <Text style={styles.checkBtnTxt}>Refresh checks</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.checkBtn, busy === 'my_list' && styles.btnDim]}
              disabled={Boolean(busy) || !uid}
              onPress={() => void onCreateMyTestListing()}
            >
              <Text style={styles.checkBtnTxt}>Create test listing (me)</Text>
            </Pressable>
            <Pressable
              style={[styles.checkBtn, busy === 'partner_list' && styles.btnDim]}
              disabled={Boolean(busy) || !uid || !getTradeDemoPartnerUserId()}
              onPress={() => void onCreatePartnerTestListing()}
            >
              <Text style={styles.checkBtnTxt}>Create test listing (partner)</Text>
            </Pressable>
            <Pressable style={styles.checkBtn} onPress={() => navigation.navigate('TradeCenterHome')}>
              <Text style={styles.checkBtnTxt}>Open Trade Center</Text>
            </Pressable>
            <Pressable style={styles.checkBtn} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
              <Text style={styles.checkBtnTxt}>Open QA tools</Text>
            </Pressable>
          </View>
          {setupChecks.length ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {setupChecks.map((c) => (
                <ChecklistRow key={c.key} item={c} />
              ))}
            </View>
          ) : setupChecking ? (
            <Text style={[styles.caption, { marginTop: spacing.md }]}>Running checks…</Text>
          ) : (
            <Text style={[styles.caption, { marginTop: spacing.md }]}>Tap refresh to run checks.</Text>
          )}
        </View>

        <Text style={styles.h}>Create demo trade</Text>
        <Pressable
          style={[styles.btn, busy === 'demo' && styles.btnDim]}
          disabled={busy === 'demo'}
          onPress={() => void onCreateIncomingDemo()}
        >
          {busy === 'demo' ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.btnTxt}>Create incoming trade offer</Text>
          )}
        </Pressable>
        <Text style={styles.caption}>
          Uses RPC qa_create_incoming_trade_from_demo: demo account sends you an offer. Needs
          EXPO_PUBLIC_TRADE_DEMO_PARTNER_USER_ID, your live listing, and partner live listing.
        </Text>

        <Text style={styles.h}>Selected trade</Text>
        <TextInput
          style={styles.input}
          placeholder="Trade / offer UUID"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={tradeId}
          onChangeText={setTradeId}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pressable style={styles.secondary} onPress={() => void reloadOffer()}>
            <Text style={styles.secondaryTxt}>Reload trade</Text>
          </Pressable>
          {offer ? <TradeStatusBadge status={offer.status} /> : null}
          {offerLoading ? <ActivityIndicator color={colors.gold} /> : null}
        </View>
        {feeHint ? <Text style={styles.caption}>{feeHint}</Text> : null}

        <Text style={styles.h}>Force status</Text>
        <View style={styles.chipWrap}>
          {QA_FORCEABLE_TRADE_STATUSES.map((st) => (
            <Pressable
              key={st}
              style={[styles.chip, busy === `st:${st}` && styles.chipDim]}
              disabled={Boolean(busy)}
              onPress={() => void onForceStatus(st)}
            >
              <Text style={styles.chipTxt}>{st}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.h}>Labels</Text>
        <Pressable
          style={[styles.btn, busy === 'labels' && styles.btnDim]}
          disabled={Boolean(busy)}
          onPress={() => void onMockLabels()}
        >
          {busy === 'labels' ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.btnTxt}>Mock labels generated</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.btnDanger, busy === 'label_err' && styles.btnDim]}
          disabled={Boolean(busy)}
          onPress={() => void onLabelError()}
        >
          {busy === 'label_err' ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.btnDangerTxt}>Trigger label error</Text>
          )}
        </Pressable>

        <Text style={styles.h}>Payment</Text>
        <Pressable
          style={[styles.btn, busy === 'stripe' && styles.btnDim]}
          disabled={Boolean(busy)}
          onPress={() => void onStripeTest()}
        >
          {busy === 'stripe' ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.btnTxt}>Open Stripe test checkout</Text>
          )}
        </Pressable>
        <Text style={styles.caption}>Uses Netlify trade-fee-checkout. Trade must be in fee_due.</Text>

        <Text style={styles.h}>Realtime & session</Text>
        <View style={styles.card}>
          <Text style={styles.mono}>last realtime: {lastRealtime ?? '—'}</Text>
          <Text style={styles.mono}>
            last feed refresh:{' '}
            {lastFeedRefresh ? new Date(lastFeedRefresh).toLocaleString() : '— (pull Trade Center home)'}
          </Text>
          <Text style={styles.mono}>session user id: {uid ?? '—'}</Text>
          <Text style={styles.mono}>current trade id: {tradeId.trim() || '—'}</Text>
        </View>

        <Pressable
          style={styles.secondary}
          onPress={() => navigation.navigate('TradeDetail', { tradeId: tradeId.trim() })}
          disabled={!tradeId.trim()}
        >
          <Ionicons name="open-outline" size={18} color={colors.gold} />
          <Text style={styles.secondaryTxt}>Open trade detail</Text>
        </Pressable>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

function statusDisplay(status: QaSetupStatus): { label: string; fg: string; bg: string } {
  switch (status) {
    case 'ready':
      return { label: 'Ready', fg: colors.success, bg: 'rgba(52,199,89,0.15)' };
    case 'missing':
      return { label: 'Missing', fg: '#c08080', bg: 'rgba(192,128,128,0.12)' };
    case 'needs_setup':
      return { label: 'Needs setup', fg: '#FFB340', bg: 'rgba(255,179,64,0.12)' };
    case 'test_failed':
      return { label: 'Test failed', fg: '#f0a8a8', bg: 'rgba(240,168,168,0.12)' };
    default:
      return { label: status, fg: colors.textMuted, bg: colors.surface };
  }
}

function ChecklistRow({ item }: { item: QaSetupCheckResult }) {
  const st = statusDisplay(item.status);
  return (
    <View style={styles.checkRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.checkTitle}>{item.title}</Text>
        {item.detail ? (
          <Text style={styles.checkDetail} numberOfLines={3}>
            {item.detail}
          </Text>
        ) : null}
      </View>
      <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
        <Text style={[styles.statusPillTxt, { color: st.fg }]}>{st.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxl, gap: spacing.md },
  warn: {
    ...typography.micro,
    color: '#d4a84b',
    lineHeight: 18,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  h: { ...typography.micro, color: colors.textMuted, letterSpacing: 1, marginTop: spacing.sm },
  checkCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  checkIntro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  checkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  checkBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  checkBtnTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  checkTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  checkDetail: { color: colors.textMuted, fontSize: 11, marginTop: 4, lineHeight: 16 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  statusPillTxt: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  btn: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnDim: { opacity: 0.65 },
  btnTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
  btnDanger: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#884444',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: 'rgba(136,68,68,0.15)',
  },
  btnDangerTxt: { color: '#f0a8a8', fontWeight: '800', fontSize: 15 },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
  },
  secondaryTxt: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  caption: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipDim: { opacity: 0.5 },
  chipTxt: { color: colors.textPrimary, fontSize: 11, fontWeight: '700' },
  mono: { color: colors.textSecondary, fontSize: 11, fontFamily: 'monospace' },
});
