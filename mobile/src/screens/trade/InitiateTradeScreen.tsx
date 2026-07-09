import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { TradeFlowHeader } from '../../components/trade/TradeFlowHeader';
import { TradeItemCard } from '../../components/trade/TradeItemCard';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../auth/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { isWebTradeApiConfigured } from '../../api/tradeOffersWebApi';
import {
  fetchLiveListingsExcludingSeller,
  fetchMyLiveListings,
  insertTradeOffer,
  resolvePublishedListingSellerId,
} from '../../api/tradeOffersRepository';
import type { ListingLite, ShippingWeightTier } from '../../types/tradeOffers';
import { listingToTradeItem } from '../../trade/listingToTradeItem';
import { navigateAuthLogin, navigateAuthSignUp } from '../../navigation/rootNavigationRef';

type Nav = NativeStackNavigationProp<TradeCenterStackParamList>;

const TIERS: { id: ShippingWeightTier; label: string }[] = [
  { id: 'cards_slabs', label: 'Cards / slabs' },
  { id: 'sneakers', label: 'Sneakers / small mem' },
  { id: 'memorabilia', label: 'Memorabilia' },
  { id: 'watches_luxury', label: 'Watches / luxury' },
  { id: 'oversized_custom', label: 'Oversized / custom' },
];

export function InitiateTradeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<TradeCenterStackParamList, 'InitiateTrade'>>();
  const requestedListingId = route.params?.requestedListingId;
  const { user } = useAuth();
  const supabaseOk = isSupabaseConfigured();
  const tradeApiOk = isWebTradeApiConfigured();
  const tradeBackendOk = tradeApiOk || supabaseOk;

  const [theirListings, setTheirListings] = useState<ListingLite[]>([]);
  const [myListings, setMyListings] = useState<ListingLite[]>([]);
  const [theirKey, setTheirKey] = useState<string | null>(null);
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<ShippingWeightTier>('cards_slabs');
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(true);

  const load = useCallback(async () => {
    if (!user || !tradeBackendOk) return;
    setListBusy(true);
    try {
      // Scope "their item" to the seller of the listing this trade was started from — otherwise
      // every other seller's tradeable inventory would leak into this picker.
      const targetSellerId = requestedListingId
        ? await resolvePublishedListingSellerId(requestedListingId)
        : null;
      const [theirs, mine] = await Promise.all([
        fetchLiveListingsExcludingSeller(user.id, targetSellerId ?? undefined),
        fetchMyLiveListings(user.id),
      ]);
      setTheirListings(theirs);
      setMyListings(mine);
      const pickTheir =
        requestedListingId && theirs.some((x) => x.id === requestedListingId)
          ? requestedListingId
          : theirs[0]?.id ?? null;
      setTheirKey(pickTheir);
      if (mine[0]) setOfferedIds(new Set([mine[0].id]));
      else setOfferedIds(new Set());
    } finally {
      setListBusy(false);
    }
  }, [user, tradeBackendOk, requestedListingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const theirPick = useMemo(() => {
    return theirListings.find((x) => x.id === theirKey) ?? theirListings[0] ?? null;
  }, [theirListings, theirKey]);

  const submit = async () => {
    if (!user || !tradeBackendOk) return;
    if (!theirKey || offeredIds.size === 0) {
      Alert.alert('Incomplete', 'Select their listing and at least one of yours.');
      return;
    }
    setBusy(true);
    try {
      const cashDiff = cash.trim() === '' ? 0 : Number(cash);
      const id = await insertTradeOffer({
        senderId: user.id,
        requestedListingId: theirKey,
        offeredListingIds: [...offeredIds],
        cashDifference: Number.isFinite(cashDiff) ? cashDiff : 0,
        message: note.trim() || null,
        weightTier: tier,
      });
      Alert.alert('Offer sent', 'Your trade is live in their inbox.', [
        { text: 'OK', onPress: () => navigation.replace('ReviewOffer', { offerId: id }) },
      ]);
    } catch (e) {
      Alert.alert('Could not send offer', e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const toggleOffered = (id: string) => {
    setOfferedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  if (!tradeBackendOk) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <TradeFlowHeader navigation={navigation} title="Initiate trade" subtitle="Backend required" />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.lead}>
            Set EXPO_PUBLIC_SITE_URL (or EXPO_PUBLIC_WEB_API_URL) so trade offers can reach the Get Vaulted API.
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <TradeFlowHeader navigation={navigation} title="Initiate trade" subtitle="Account required" />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.lead}>You need an account to start or review trades.</Text>
          <Pressable style={styles.primary} onPress={navigateAuthSignUp}>
            <Text style={styles.primaryTxt}>Create account</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={navigateAuthLogin}>
            <Text style={styles.secondaryTxt}>Log in</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <TradeFlowHeader navigation={navigation} title="Initiate trade" subtitle="Account holders only" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          Pick a live listing you want, what you send from your vault, weight tier, optional cash, and a note.
        </Text>

        {listBusy ? <Text style={styles.hint}>Loading listings…</Text> : null}

        <Text style={styles.section}>Their item (you receive)</Text>
        {theirListings.length === 0 && !listBusy ? (
          <Text style={styles.hint}>No other sellers have live listings right now. Check back soon.</Text>
        ) : (
          theirListings.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.pickRow, theirKey === item.id && styles.pickOn]}
              onPress={() => setTheirKey(item.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.condition ?? '—'} · ${item.price.toLocaleString()}
                </Text>
              </View>
              <Ionicons
                name={theirKey === item.id ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={theirKey === item.id ? colors.gold : colors.textMuted}
              />
            </Pressable>
          ))
        )}

        <Text style={styles.section}>Your vault (you send)</Text>
        {myListings.length === 0 && !listBusy ? (
          <Text style={styles.hint}>Create a live listing first, then return here to offer it in a trade.</Text>
        ) : (
          myListings.map((item) => {
            const on = offeredIds.has(item.id);
            return (
              <Pressable
                key={item.id}
                style={[styles.pickRow, on && styles.pickOn]}
                onPress={() => toggleOffered(item.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.meta}>
                    {item.condition ?? '—'} · ${item.price.toLocaleString()}
                  </Text>
                </View>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={on ? colors.gold : colors.textMuted}
                />
              </Pressable>
            );
          })
        )}

        <Text style={styles.section}>Shipping weight tier</Text>
        {TIERS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.pickRow, tier === t.id && styles.pickOn]}
            onPress={() => setTier(t.id)}
          >
            <Text style={styles.itemTitle}>{t.label}</Text>
            <Ionicons
              name={tier === t.id ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={tier === t.id ? colors.gold : colors.textMuted}
            />
          </Pressable>
        ))}

        <Text style={styles.section}>Optional cash difference (USD you add)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 150"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={cash}
          onChangeText={setCash}
        />

        <Text style={styles.section}>Message to the other party</Text>
        <TextInput
          style={[styles.input, styles.inputTall]}
          placeholder="Verification preferences, ship windows, etc."
          placeholderTextColor={colors.textMuted}
          multiline
          value={note}
          onChangeText={setNote}
        />

        {theirPick ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.previewLabel}>Preview</Text>
            <TradeItemCard item={listingToTradeItem(theirPick)} caption="You receive" />
          </View>
        ) : null}

        <Pressable style={[styles.primary, busy && { opacity: 0.7 }]} disabled={busy} onPress={() => void submit()}>
          <Text style={styles.primaryTxt}>{busy ? 'Sending…' : 'Submit trade offer'}</Text>
        </Pressable>
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxl, gap: spacing.md },
  lead: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
  section: {
    ...typography.micro,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.md,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  pickOn: { borderColor: 'rgba(212,175,55,0.45)', backgroundColor: 'rgba(212,175,55,0.06)' },
  itemTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  input: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    backgroundColor: colors.surfaceElevated,
  },
  inputTall: { minHeight: 100, textAlignVertical: 'top' },
  previewLabel: { ...typography.micro, color: colors.textMuted, marginBottom: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  primary: {
    marginTop: spacing.xl,
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
  secondary: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  secondaryTxt: { color: colors.gold, fontWeight: '800', fontSize: 16 },
});
