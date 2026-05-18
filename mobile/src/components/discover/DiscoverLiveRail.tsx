import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LIVE_ROOM_CARD_SNAP, LiveNowPreviewCard } from '../home/LiveNowPreviewCard';
import { colors, spacing } from '../../theme';
import type { LiveStream } from '../../types';

export function DiscoverLiveRail({
  streams,
  onPressStream,
  onOpenLiveHub,
}: {
  streams: LiveStream[];
  onPressStream: (id: string) => void;
  onOpenLiveHub: () => void;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live right now</Text>
          <Text style={styles.sub}>Live auctions · collector rooms · vault drops</Text>
        </View>
        <Pressable onPress={onOpenLiveHub} hitSlop={8}>
          <Text style={styles.link}>Live hub</Text>
        </Pressable>
      </View>
      {streams.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
          snapToInterval={LIVE_ROOM_CARD_SNAP}
          snapToAlignment="start"
          decelerationRate="fast"
        >
          {streams.map((s) => (
            <LiveNowPreviewCard key={s.id} stream={s} onPress={() => onPressStream(s.id)} />
          ))}
        </ScrollView>
      ) : (
        <Pressable style={styles.placeholder} onPress={onOpenLiveHub}>
          <Text style={styles.phTitle}>Rooms heating up</Text>
          <Text style={styles.phSub}>Tap for live discovery</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.sm },
  title: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  sub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  link: { fontSize: 12, fontWeight: '800', color: colors.gold },
  rail: { paddingRight: spacing.lg, gap: spacing.sm },
  placeholder: {
    height: 88,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.35)',
    backgroundColor: 'rgba(255,59,48,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  phTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  phSub: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
});
