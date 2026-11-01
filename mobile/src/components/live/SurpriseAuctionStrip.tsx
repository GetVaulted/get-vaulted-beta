import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { confirmAdult, fetchAdultConfirmation } from '../../api/liveVariantPurchaseRepository';
import { colors } from '../../theme';
import { computeSurpriseSetOdds, formatOddsPercent } from '../../../../shared/surprise-set';
import { LiveRoomText } from './LiveRoomText';

const DISCLOSURE =
  "This is a random draw. You don't choose what you get, and what you receive can be worth more or less than what you pay.";

/** True when the active lot is a Surprise Set sold as an auction (one unit per round). */
export function isSurpriseAuctionLot(
  salesFormat: string | null | undefined,
  surpriseSetItems: ReadonlyArray<{ name: string; quantity: number }> | null | undefined,
): boolean {
  return salesFormat === 'auction' && Boolean(surpriseSetItems?.length);
}

/**
 * Compact strip above the bid controls for a Surprise Set auction: the winner gets a random item,
 * tap for live odds, plus the one-time 18+ confirmation the server requires before bidding.
 */
export function SurpriseAuctionStrip({
  itemId,
  surpriseSetItems,
  claimedLabels,
  accessToken,
}: {
  itemId: string;
  surpriseSetItems: ReadonlyArray<{ name: string; quantity: number }>;
  claimedLabels: readonly string[] | undefined;
  accessToken?: string;
}) {
  const [adult, setAdult] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetchAdultConfirmation(accessToken).then((v) => {
      if (!cancelled) setAdult(v);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, itemId]);

  const odds = useMemo(
    () => computeSurpriseSetOdds([...surpriseSetItems], [...(claimedLabels ?? [])]),
    [surpriseSetItems, claimedLabels],
  );

  const askConfirm = () => {
    if (!accessToken || saving) return;
    Alert.alert('Confirm you’re 18+', `${DISCLOSURE}\n\nThe winner of each round gets one random item from this set.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'I’m 18 or older',
        onPress: () => {
          setSaving(true);
          void confirmAdult(accessToken)
            .then((r) => {
              if (r.ok) setAdult(true);
              else Alert.alert('Not saved', r.error);
            })
            .finally(() => setSaving(false));
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          style={styles.info}
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel="Surprise Set odds"
        >
          <LiveRoomText style={styles.kicker}>SURPRISE SET</LiveRoomText>
          <LiveRoomText style={styles.text} numberOfLines={1}>
            Winner gets 1 random item · {odds.remainingUnits} left · {open ? 'Hide odds' : 'Odds ›'}
          </LiveRoomText>
        </Pressable>
        {accessToken && adult === false ? (
          <Pressable style={styles.confirm} onPress={askConfirm} disabled={saving} accessibilityRole="button">
            <LiveRoomText style={styles.confirmTxt}>{saving ? '…' : '18+ to bid'}</LiveRoomText>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <ScrollView style={styles.odds} nestedScrollEnabled>
          <LiveRoomText style={styles.disclosure}>{DISCLOSURE}</LiveRoomText>
          {odds.rows.map((r) => (
            <View key={r.name} style={styles.oddsRow}>
              <LiveRoomText style={styles.oddsName} numberOfLines={1}>
                {r.name}
              </LiveRoomText>
              <LiveRoomText style={styles.oddsVal}>
                {r.remaining} left · {formatOddsPercent(r.odds)}
              </LiveRoomText>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(252, 211, 77, 0.35)',
    backgroundColor: 'rgba(10,10,12,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.6, color: '#fcd34d' },
  text: { marginTop: 1, fontSize: 12, fontWeight: '700', color: '#fff' },
  confirm: {
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: '#fcd34d',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confirmTxt: { fontSize: 11, fontWeight: '900', color: '#000' },
  odds: { maxHeight: 140, marginTop: 6 },
  disclosure: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  oddsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  oddsName: { flex: 1, marginRight: 8, fontSize: 12, color: '#fff' },
  oddsVal: { fontSize: 11, color: colors.textSecondary },
});
