import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  deletePullMedia,
  fetchMyPullMedia,
  reorderPullMedia,
  uploadPullPhoto,
  uploadPullVideo,
  type PullMediaDto,
} from '../../api/pullMediaRepository';
import { useAuth } from '../../auth/AuthContext';
import {
  PULL_MEDIA_MAX_PHOTOS,
  PULL_MEDIA_MAX_VIDEOS,
  preparePullPhotoForUpload,
  validatePullVideoBytes,
  validatePullVideoDurationMs,
} from '../../lib/pullMediaPrepare';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PullMediaManage'>;

export function PullMediaManageScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [media, setMedia] = useState<PullMediaDto[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const rows = await fetchMyPullMedia(accessToken);
    setMedia(rows);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const photoCount = media?.filter((m) => m.type === 'PHOTO').length ?? 0;
  const videoCount = media?.filter((m) => m.type === 'VIDEO').length ?? 0;

  const onAddPhoto = async () => {
    if (!accessToken || photoCount >= PULL_MEDIA_MAX_PHOTOS) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true);
    try {
      const uri = await preparePullPhotoForUpload(picked.assets[0].uri);
      const row = await uploadPullPhoto(accessToken, uri);
      setMedia((prev) => [...(prev ?? []), row]);
    } catch (e) {
      Alert.alert('Could not add photo', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const onAddVideo = async () => {
    if (!accessToken || videoCount >= PULL_MEDIA_MAX_VIDEOS) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const durationCheck = validatePullVideoDurationMs(asset.duration ?? 0);
    if (!durationCheck.ok) {
      Alert.alert('Video too long', durationCheck.error);
      return;
    }
    if (typeof asset.fileSize === 'number') {
      const sizeCheck = validatePullVideoBytes(asset.fileSize);
      if (!sizeCheck.ok) {
        Alert.alert('Video too large', sizeCheck.error);
        return;
      }
    }
    setBusy(true);
    try {
      const mime = asset.mimeType === 'video/quicktime' ? 'video/quicktime' : 'video/mp4';
      const row = await uploadPullVideo(accessToken, asset.uri, asset.duration ?? 0, mime);
      setMedia((prev) => [...(prev ?? []), row]);
    } catch (e) {
      Alert.alert('Could not add video', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (id: string) => {
    if (!accessToken) return;
    Alert.alert('Delete', 'Remove this from your Pulls?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const prev = media;
          setMedia((cur) => (cur ? cur.filter((m) => m.id !== id) : cur));
          void deletePullMedia(accessToken, id).catch((e) => {
            setMedia(prev ?? null);
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Unknown error');
          });
        },
      },
    ]);
  };

  const move = (id: string, direction: -1 | 1) => {
    if (!accessToken || !media) return;
    const idx = media.findIndex((m) => m.id === id);
    const swapWith = idx + direction;
    if (idx === -1 || swapWith < 0 || swapWith >= media.length) return;
    const next = [...media];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setMedia(next);
    void reorderPullMedia(accessToken, next.map((m) => m.id)).catch(() => {
      void load();
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Pulls</Text>
        <View style={{ width: 24 }} />
      </View>

      {media == null ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.hint}>
            Show off your best pulls on your profile — up to {PULL_MEDIA_MAX_PHOTOS} photos and{' '}
            {PULL_MEDIA_MAX_VIDEOS} short videos (20s or shorter).
          </Text>

          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionBtn, (busy || photoCount >= PULL_MEDIA_MAX_PHOTOS) && styles.actionBtnDisabled]}
              disabled={busy || photoCount >= PULL_MEDIA_MAX_PHOTOS}
              onPress={() => void onAddPhoto()}
            >
              <Text style={styles.actionTxt}>Add photo</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtnAlt, (busy || videoCount >= PULL_MEDIA_MAX_VIDEOS) && styles.actionBtnDisabled]}
              disabled={busy || videoCount >= PULL_MEDIA_MAX_VIDEOS}
              onPress={() => void onAddVideo()}
            >
              <Text style={styles.actionTxtAlt}>Add video</Text>
            </Pressable>
          </View>
          <Text style={styles.counter}>
            {photoCount}/{PULL_MEDIA_MAX_PHOTOS} photos · {videoCount}/{PULL_MEDIA_MAX_VIDEOS} videos
          </Text>
          {busy ? <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.sm }} /> : null}

          <View style={styles.grid}>
            {media.map((item, index) => (
              <View key={item.id} style={styles.tile}>
                <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {item.type === 'VIDEO' ? (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationTxt}>{Math.round((item.durationMs ?? 0) / 1000)}s</Text>
                  </View>
                ) : null}
                <View style={styles.tileControls}>
                  <Pressable disabled={index === 0} onPress={() => move(item.id, -1)} hitSlop={8}>
                    <Ionicons name="arrow-back" size={16} color={index === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
                  </Pressable>
                  <Pressable onPress={() => onDelete(item.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color="#f87171" />
                  </Pressable>
                  <Pressable
                    disabled={index === media.length - 1}
                    onPress={() => move(item.id, 1)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={index === media.length - 1 ? 'rgba(255,255,255,0.3)' : '#fff'}
                    />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          {!media.length ? <Text style={styles.empty}>No pulls yet — add your first photo or video.</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

const TILE_SIZE = 108;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 18 },
  scroll: { paddingBottom: spacing.xxl },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  actionTxt: { color: colors.background, fontWeight: '800', fontSize: 14 },
  actionBtnAlt: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  actionTxtAlt: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  actionBtnDisabled: { opacity: 0.4 },
  counter: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.lg },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  durationBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  tileControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: spacing.lg, textAlign: 'center' },
});
