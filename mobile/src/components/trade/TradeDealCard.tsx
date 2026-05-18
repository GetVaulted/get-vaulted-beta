import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import { displayTradeStatus } from '../../lib/tradeStatusLabels';
import { colors, radii, spacing } from '../../theme';
import type { ListingLite, ProfileLite, TradeOfferStatus } from '../../types/tradeOffers';
import { TradeStatusBadge } from './TradeStatusBadge';

function listingImageUrl(media: unknown): string | null {
  if (typeof media === 'string' && media.length > 0) return media;
  if (Array.isArray(media) && typeof media[0] === 'string') return media[0];
  return null;
}

function profileHandle(p: ProfileLite): string {
  if (p.username) return `@${p.username}`;
  return p.display_name ?? 'Collector';
}

function estValue(listings: ListingLite[]): string {
  const total = listings.reduce((s, l) => s + (l.price > 0 ? l.price : 0), 0);
  if (total <= 0) return '—';
  return `$${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function isVaultVerified(l: ListingLite): boolean {
  const s = l.authentication_status?.toLowerCase() ?? '';
  return s.includes('vaulted') || s.includes('verified');
}

type Props = {
  partner: ProfileLite;
  status: TradeOfferStatus;
  requested: ListingLite;
  offered: ListingLite[];
  onPress: () => void;
  /** e.g. negotiation thread preview */
  messagePreview?: string | null;
};

export function TradeDealCard({ partner, status, requested, offered, onPress, messagePreview }: Props) {
  const thumbs = [requested, ...offered.slice(0, 1)];
  const allItems = [requested, ...offered];
  const verified = allItems.some(isVaultVerified);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shell, pressed && styles.pressed]}>
      <View style={styles.top}>
        <VaultImage
          uri={
            partner.avatar_url?.trim() ||
            `https://i.pravatar.cc/80?u=${encodeURIComponent(partner.id)}`
          }
          width={40}
          height={40}
          borderRadius={20}
          priority="low"
        />
        <View style={styles.headMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.handle} numberOfLines={1}>
              {profileHandle(partner)}
            </Text>
            <Ionicons name="checkmark-circle" size={15} color={colors.gold} />
          </View>
          {messagePreview ? (
            <Text style={styles.preview} numberOfLines={1}>
              {messagePreview}
            </Text>
          ) : (
            <Text style={styles.preview} numberOfLines={1}>
              {offered.length ? `${offered.length + 1} items in play` : 'Vault trade'}
            </Text>
          )}
        </View>
        <TradeStatusBadge status={status} />
      </View>

      <View style={styles.itemsRow}>
        {thumbs.map((item, i) => {
          const uri =
            listingImageUrl(item.media_urls) ??
            'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200';
          return (
            <View key={item.id} style={styles.thumbWrap}>
              <VaultImage uri={uri} width={72} height={72} borderRadius={radii.md} contentFit="cover" />
              {i === 0 ? (
                <View style={styles.thumbTag}>
                  <Text style={styles.thumbTagTxt}>THEIRS</Text>
                </View>
              ) : (
                <View style={[styles.thumbTag, styles.thumbTagYou]}>
                  <Text style={styles.thumbTagTxt}>YOURS</Text>
                </View>
              )}
            </View>
          );
        })}
        <View style={styles.valueCol}>
          <Text style={styles.valueLbl}>Est. deal value</Text>
          <Text style={styles.valueAmt}>{estValue(allItems)}</Text>
          {verified ? (
            <View style={styles.vvRow}>
              <Ionicons name="shield-checkmark" size={11} color={colors.gold} />
              <Text style={styles.vvTxt}>Vault verified</Text>
            </View>
          ) : null}
          <Text style={styles.statusLine}>{displayTradeStatus(status)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: colors.surfaceElevated,
    gap: spacing.md,
  },
  pressed: { opacity: 0.96 },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headMeta: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  handle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  preview: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  thumbTag: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  thumbTagYou: {
    backgroundColor: 'rgba(212,175,55,0.75)',
  },
  thumbTagTxt: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.4,
  },
  valueCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  valueLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  valueAmt: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  vvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  vvTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.gold,
  },
  statusLine: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.live,
  },
});
