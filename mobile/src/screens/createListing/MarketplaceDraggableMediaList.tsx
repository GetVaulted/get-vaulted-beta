import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import type { ListingMediaItem } from '../../createListing/types';
import { colors, radii, spacing } from '../../theme';

type Props = {
  media: ListingMediaItem[];
  accentPrimary: string;
  onReorder: (next: ListingMediaItem[]) => void;
  onRepick: (id: string, kind: 'photo' | 'video') => void;
  onRemove: (id: string) => void;
};

function MediaRow({
  item,
  drag,
  isActive,
  accentPrimary,
  onRepick,
  onRemove,
}: {
  item: ListingMediaItem;
  drag: () => void;
  isActive: boolean;
  accentPrimary: string;
  onRepick: (id: string, kind: 'photo' | 'video') => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Pressable
      onLongPress={drag}
      delayLongPress={120}
      style={[styles.mediaCard, isActive && styles.mediaCardDragging]}
    >
      <Pressable
        onPressIn={drag}
        style={styles.dragHandle}
        accessibilityRole="button"
        accessibilityLabel="Drag to reorder"
        hitSlop={8}
      >
        <Ionicons name="reorder-three" size={24} color={isActive ? accentPrimary : colors.textMuted} />
      </Pressable>
      <Image source={{ uri: item.uri }} style={styles.mediaImg} resizeMode="cover" />
      <View style={styles.mediaBody}>
        <Text style={styles.mediaCap}>{item.label}</Text>
        <Text style={styles.mediaKind}>{item.kind === 'video' ? 'Video' : 'Photo'}</Text>
        <View style={styles.mediaRow}>
          <Pressable onPress={() => void onRepick(item.id, item.kind === 'video' ? 'video' : 'photo')}>
            <Text style={[styles.link, { color: accentPrimary }]}>Replace photo</Text>
          </Pressable>
          <Pressable onPress={() => onRemove(item.id)}>
            <Text style={styles.linkDanger}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export function MarketplaceDraggableMediaList({ media, accentPrimary, onReorder, onRepick, onRemove }: Props) {
  const renderItem = ({ item, drag, isActive }: RenderItemParams<ListingMediaItem>) => (
    <ScaleDecorator>
      <MediaRow
        item={item}
        drag={drag}
        isActive={isActive}
        accentPrimary={accentPrimary}
        onRepick={onRepick}
        onRemove={onRemove}
      />
    </ScaleDecorator>
  );

  return (
    <DraggableFlatList
      data={media}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      onDragEnd={({ data }) => onReorder(data)}
      scrollEnabled={false}
      containerStyle={styles.listContainer}
      activationDistance={12}
    />
  );
}

const styles = StyleSheet.create({
  listContainer: {
    flexGrow: 0,
  },
  mediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  mediaCardDragging: {
    opacity: 0.92,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dragHandle: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  mediaImg: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.surface },
  mediaBody: { flex: 1, gap: 4 },
  mediaCap: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  mediaKind: { color: colors.textMuted, fontSize: 12 },
  mediaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs, flexWrap: 'wrap' },
  link: { fontWeight: '700', fontSize: 13 },
  linkDanger: { color: colors.live, fontWeight: '700', fontSize: 13 },
});
