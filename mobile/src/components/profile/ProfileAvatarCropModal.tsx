import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  computeAvatarCropRect,
  cropAvatarImage,
  prepareProfileAvatarForUpload,
} from '../../lib/profileAvatarUpload';
import { colors, radii, spacing } from '../../theme';

const CROP_SIZE = 280;
const MIN_SCALE = 1;
const MAX_SCALE = 3;

export function ProfileAvatarCropModal({
  visible,
  imageUri,
  busy,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  imageUri: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (preparedUri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [userScale, setUserScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!visible) {
      setImageSize(null);
      setUserScale(1);
      setOffset({ x: 0, y: 0 });
      setProcessing(false);
    }
  }, [visible, imageUri]);

  const baseScale = useMemo(() => {
    if (!imageSize) return 1;
    return Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height);
  }, [imageSize]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartRef.current = offsetRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        setOffset({
          x: panStartRef.current.x + gesture.dx,
          y: panStartRef.current.y + gesture.dy,
        });
      },
    }),
  ).current;

  const displayed = useMemo(() => {
    if (!imageSize) return null;
    const totalScale = baseScale * userScale;
    const width = imageSize.width * totalScale;
    const height = imageSize.height * totalScale;
    const left = (CROP_SIZE - width) / 2 + offset.x;
    const top = (CROP_SIZE - height) / 2 + offset.y;
    return { width, height, left, top };
  }, [baseScale, imageSize, offset.x, offset.y, userScale]);

  const save = async () => {
    if (!imageUri || !imageSize || busy || processing) return;
    setProcessing(true);
    try {
      const crop = computeAvatarCropRect({
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
        viewportSize: CROP_SIZE,
        userScale,
        offsetX: offset.x,
        offsetY: offset.y,
      });
      const cropped = await cropAvatarImage(imageUri, crop);
      const prepared = await prepareProfileAvatarForUpload(cropped);
      onConfirm(prepared);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} disabled={busy || processing}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Crop profile photo</Text>
          <View style={{ width: 56 }} />
        </View>

        <Text style={styles.sub}>Drag to reposition · pinch zoom with buttons</Text>

        <View style={styles.cropHost}>
          <View style={styles.cropCircle} {...panResponder.panHandlers}>
            {imageUri && displayed ? (
              <Image
                source={{ uri: imageUri }}
                style={{
                  position: 'absolute',
                  width: displayed.width,
                  height: displayed.height,
                  left: displayed.left,
                  top: displayed.top,
                }}
                contentFit="fill"
                onLoad={(e) => {
                  const src = e.source;
                  if (src.width > 0 && src.height > 0) {
                    setImageSize({ width: src.width, height: src.height });
                  }
                }}
              />
            ) : (
              <ActivityIndicator color={colors.gold} />
            )}
          </View>
          <View pointerEvents="none" style={styles.ring} />
        </View>

        <View style={styles.zoomRow}>
          <Pressable
            style={styles.zoomBtn}
            onPress={() => setUserScale((s) => Math.max(MIN_SCALE, Number((s - 0.15).toFixed(2))))}
            disabled={busy || processing}
          >
            <Ionicons name="remove" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.zoomLbl}>Zoom</Text>
          <Pressable
            style={styles.zoomBtn}
            onPress={() => setUserScale((s) => Math.min(MAX_SCALE, Number((s + 0.15).toFixed(2))))}
            disabled={busy || processing}
          >
            <Ionicons name="add" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <Pressable
          style={[styles.primary, (busy || processing) && styles.primaryOff]}
          onPress={() => void save()}
          disabled={!imageUri || !imageSize || busy || processing}
        >
          {processing ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryTxt}>Use photo</Text>
          )}
        </Pressable>

        {Platform.OS === 'android' ? (
          <Text style={styles.hint}>Circle crop · saved as a round profile photo</Text>
        ) : (
          <Text style={styles.hint}>Circle crop · drag and zoom to frame your photo</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cancelTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 15, width: 56 },
  title: { color: colors.textPrimary, fontWeight: '800', fontSize: 17 },
  sub: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.lg,
  },
  cropHost: {
    alignSelf: 'center',
    width: CROP_SIZE,
    height: CROP_SIZE,
    marginBottom: spacing.lg,
  },
  cropCircle: {
    width: CROP_SIZE,
    height: CROP_SIZE,
    borderRadius: CROP_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CROP_SIZE / 2,
    borderWidth: 3,
    borderColor: 'rgba(212,175,55,0.75)',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  zoomLbl: { color: colors.textSecondary, fontWeight: '700', fontSize: 13, minWidth: 48, textAlign: 'center' },
  primary: {
    backgroundColor: colors.gold,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryOff: { opacity: 0.55 },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
  hint: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
});
