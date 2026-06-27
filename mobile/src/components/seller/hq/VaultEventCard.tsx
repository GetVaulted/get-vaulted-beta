import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveRoomApiRow } from '../../../api/liveRoomsRepository';
import { mapListingCategoryToCategoryId } from '../../../api/listingsFeedRepository';
import { formatBreakRoomTileCategoryLine, formatLiveRoomCategoryLabel } from '../../../lib/liveRoomDisplay';
import {
  canCancelVaultEvent,
  formatEventWhen,
  primaryCta,
  statusLabel,
  type VaultEventDisplayStatus,
} from '../../../lib/vaultEventModel';
import { VaultImage } from '../../ui/VaultImage';
import { UserAvatar } from '../../ui/UserAvatar';
import { colors, radii, spacing } from '../../../theme';

const CARD_H = 200;

const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80&auto=format&fit=crop';

export function VaultEventCard({
  room,
  displayStatus,
  sellerAvatarUrl,
  onPress,
  onPrimaryAction,
  onCancel,
  cancelBusy,
}: {
  room: LiveRoomApiRow;
  displayStatus: VaultEventDisplayStatus;
  sellerAvatarUrl?: string | null;
  onPress: () => void;
  onPrimaryAction: () => void;
  onCancel?: () => void;
  cancelBusy?: boolean;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  const isLive = displayStatus === 'live';
  const cta = primaryCta(displayStatus);
  const showCancel = Boolean(onCancel && canCancelVaultEvent(room));
  const cover = room.thumbnailUrl?.trim() || FALLBACK_COVER;
  const categoryLabel =
    formatBreakRoomTileCategoryLine(room.category, room.roomType === 'break') ??
    formatLiveRoomCategoryLabel(room.category, mapListingCategoryToCategoryId(room.category));

  useEffect(() => {
    if (!isLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, pulse]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${room.title}, ${statusLabel(displayStatus)}`}
    >
      <VaultImage
        uri={cover}
        width={400}
        height={CARD_H}
        priority="normal"
        contentFit="cover"
        style={styles.coverImage}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {isLive ? (
        <Animated.View style={[styles.livePulse, { opacity: pulse }]} pointerEvents="none" />
      ) : null}
      <View style={styles.topRow}>
        <View style={[styles.statusPill, isLive && styles.statusPillLive]}>
          {isLive ? <View style={styles.liveDot} /> : null}
          <Text style={[styles.statusTxt, isLive && styles.statusTxtLive]}>{statusLabel(displayStatus)}</Text>
        </View>
        <Text style={styles.category}>{categoryLabel}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {room.title}
        </Text>
        <Text style={styles.when}>{formatEventWhen(room, displayStatus)}</Text>
        <View style={styles.metaRow}>
          <UserAvatar
            uri={sellerAvatarUrl}
            username={room.sellerUsername}
            size={22}
            borderColor="rgba(255,255,255,0.2)"
          />
          <Text style={styles.metaTxt}>
            @{room.sellerUsername}
            {room.itemCount > 0 ? ` · ${room.itemCount} lots` : ' · setup inventory'}
          </Text>
        </View>
        {room.activeItemTitle ? (
          <Text style={styles.activeLot} numberOfLines={1}>
            On screen: {room.activeItemTitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.ctaRow}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.ctaAndroid} />
        )}
        <View style={styles.ctaBtnRow}>
          <Pressable
            style={[styles.ctaBtn, showCancel && styles.ctaBtnSplit]}
            onPress={(e) => {
              e.stopPropagation?.();
              onPrimaryAction();
            }}
          >
            <Text style={styles.ctaTxt}>{cta.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gold} />
          </Pressable>
          {showCancel ? (
            <Pressable
              style={[styles.cancelBtn, cancelBusy && styles.cancelBtnBusy]}
              disabled={cancelBusy}
              onPress={(e) => {
                e.stopPropagation?.();
                onCancel?.();
              }}
              accessibilityRole="button"
              accessibilityLabel={isLive ? 'End show' : 'Cancel show'}
            >
              <Text style={styles.cancelTxt}>{isLive ? 'End show' : 'Cancel'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    alignSelf: 'stretch',
    height: CARD_H,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  livePulse: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(255,59,48,0.45)',
  },
  topRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  statusPillLive: {
    borderColor: 'rgba(255,59,48,0.55)',
    backgroundColor: 'rgba(255,59,48,0.2)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
  statusTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: colors.gold },
  statusTxtLive: { color: '#fff' },
  category: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  body: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 52,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  when: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  metaTxt: { flex: 1, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  activeLot: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: colors.gold,
  },
  ctaRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(212,175,55,0.35)',
  },
  ctaAndroid: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,10,0.88)' },
  ctaBtnRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    zIndex: 1,
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  ctaBtnSplit: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(212,175,55,0.25)',
  },
  ctaTxt: { fontSize: 13, fontWeight: '800', color: colors.gold },
  cancelBtn: {
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  cancelBtnBusy: { opacity: 0.45 },
  cancelTxt: { fontSize: 12, fontWeight: '800', color: '#fca5a5' },
});
