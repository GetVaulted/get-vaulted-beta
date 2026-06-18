import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchProfileById, updateMyProfile, uploadMyAvatar } from '../../api/profilesRepository';
import { ProfileAvatarCropModal } from '../../components/profile/ProfileAvatarCropModal';
import { SellerHQEntryBanner } from '../../components/seller/SellerHQEntryBanner';
import { useAuth } from '../../auth/AuthContext';
import { useSellerStripeConnect } from '../../hooks/useSellerStripeConnect';
import type { SellerHQEntryPhase } from '../../lib/sellerHubEntry';
import { avatarUrlWithCacheBust } from '../../lib/profileAvatarUpload';
import { openSellerHQ } from '../../navigation/openSellerHQ';
import { openSettings } from '../../navigation/openPlatform';
import { navigateAuthSignUp } from '../../navigation/rootNavigationRef';
import { getSupabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileEdit'>;

const AVATAR_SIZE = 112;

export function ProfileEditScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const sellerConnect = useSellerStripeConnect(session?.access_token);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const p = await fetchProfileById(user.id);
      setUsername(p?.username ?? '');
      setDisplayName(p?.display_name ?? '');
      const remote = p?.avatar_url?.trim() || null;
      setAvatarUrl(remote ? avatarUrlWithCacheBust(remote) : null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChangePhoto = async () => {
    if (!user?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photos',
        'Please allow photo library access to choose a profile picture. On iOS in Expo Go, you may see an Expo prompt about this project needing permission—tap Allow so this app can use the photo library.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]) return;
    setCropUri(picked.assets[0].uri);
  };

  const onCropConfirm = async (preparedUri: string) => {
    if (!user?.id) return;
    setUploadingAvatar(true);
    setAvatarUrl(preparedUri);
    try {
      const publicUrl = await uploadMyAvatar(user.id, preparedUri);
      await updateMyProfile(user.id, { avatar_url: publicUrl });
      const sb = getSupabase();
      if (sb) {
        await sb.auth.updateUser({ data: { avatar_url: publicUrl } });
      }
      setAvatarUrl(publicUrl);
      setCropUri(null);
      Alert.alert('Saved', 'Your profile picture was updated.');
    } catch (e) {
      setAvatarUrl((prev) => (prev === preparedUri ? null : prev));
      Alert.alert('Could not upload photo', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateMyProfile(user.id, {
        username: username.trim() || undefined,
        display_name: displayName.trim() || undefined,
      });
      Alert.alert('Saved', 'Your profile was updated.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Edit profile</Text>
        <Pressable onPress={() => openSettings(navigation)} hitSlop={12}>
          <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SellerHQEntryBanner
            hasUser={Boolean(user)}
            connect={sellerConnect.status}
            connectLoading={sellerConnect.loading}
            compact
            onPress={(phase: SellerHQEntryPhase) => {
              if (phase === 'guest') {
                navigateAuthSignUp();
                return;
              }
              navigation.goBack();
              openSellerHQ();
            }}
          />
          <View style={styles.avatarBlock}>
            <View style={styles.avatarRing}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <View style={[styles.avatarImg, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>
                    {(displayName || username || '?').trim().slice(0, 1).toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              {uploadingAvatar ? (
                <View style={styles.avatarLoading}>
                  <ActivityIndicator color={colors.gold} />
                </View>
              ) : null}
            </View>
            <Pressable
              style={[styles.changePhotoBtn, (uploadingAvatar || saving) && { opacity: 0.6 }]}
              disabled={uploadingAvatar || saving}
              onPress={() => void onChangePhoto()}
            >
              <Text style={styles.changePhotoTxt}>Change profile photo</Text>
            </Pressable>
            <Text style={styles.avatarHint}>Circle crop · JPG up to 5 MB · optimized for fast loading</Text>
          </View>

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="username"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor={colors.textMuted}
            value={displayName}
            onChangeText={setDisplayName}
          />
          <Pressable style={[styles.primary, saving && { opacity: 0.7 }]} disabled={saving} onPress={() => void onSave()}>
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.primaryTxt}>Save</Text>
            )}
          </Pressable>
        </ScrollView>
      )}

      <ProfileAvatarCropModal
        visible={cropUri != null}
        imageUri={cropUri}
        busy={uploadingAvatar}
        onClose={() => setCropUri(null)}
        onConfirm={(preparedUri) => void onCropConfirm(preparedUri)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 18 },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxl },
  avatarBlock: { alignItems: 'center', marginBottom: spacing.md },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallback: { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface },
  avatarFallbackText: { fontSize: 40, fontWeight: '800', color: colors.gold },
  changePhotoBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  changePhotoTxt: { color: colors.gold, fontWeight: '700', fontSize: 15 },
  avatarHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs, textAlign: 'center' },
  label: { ...typography.micro, color: colors.textMuted, letterSpacing: 1 },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  primary: {
    marginTop: spacing.lg,
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
});
