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
import {
  canSubmitUsernameChange,
  changeUsernameViaApi,
  fetchUsernameChangeStatus,
  type UsernameChangeStatus,
} from '../../api/profileSetupRepository';
import {
  fetchMyPublicProfile,
  saveMyPublicProfile,
  uploadMyBanner,
} from '../../api/publicProfileRepository';
import { ProfileAvatarCropModal } from '../../components/profile/ProfileAvatarCropModal';
import { SellerHQEntryBanner } from '../../components/seller/SellerHQEntryBanner';
import { useAuth } from '../../auth/AuthContext';
import { useSellerSetupState } from '../../hooks/useSellerSetupState';
import { useSellerStripeConnect } from '../../hooks/useSellerStripeConnect';
import type { SellerHQEntryPhase } from '../../lib/sellerHubEntry';
import { avatarUrlWithCacheBust } from '../../lib/profileAvatarUpload';
import { persistProfileAvatarEverywhere, resolveCanonicalProfileAvatar } from '../../lib/profileAvatarSync';
import {
  PROFILE_BIO_MAX,
  PROFILE_LINK_KEYS,
  PROFILE_LINK_LABELS,
  PROFILE_LINK_PLACEHOLDERS,
  type ProfileLinkKey,
} from '../../lib/sellerProfileView';
import { openSellerHQ } from '../../navigation/openSellerHQ';
import { openSettings } from '../../navigation/openPlatform';
import { navigateAuthSignUp } from '../../navigation/rootNavigationRef';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileEdit'>;

const AVATAR_SIZE = 112;

export function ProfileEditScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const sellerConnect = useSellerStripeConnect(session?.access_token);
  const sellerSetup = useSellerSetupState(session?.access_token, user?.id, Boolean(user?.id));
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [initialUsername, setInitialUsername] = useState('');
  const [usernameEligibility, setUsernameEligibility] = useState<UsernameChangeStatus | null>(null);
  const [bio, setBio] = useState('');
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [links, setLinks] = useState<Partial<Record<ProfileLinkKey, string>>>({});
  const [uploadingBanner, setUploadingBanner] = useState(false);
  /** False until the public profile loaded, so a failed load can never overwrite saved values with blanks. */
  const [publicLoaded, setPublicLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const p = await fetchProfileById(user.id);
      setUsername(p?.username ?? '');
      setInitialUsername(p?.username ?? '');
      if (session?.access_token) {
        try {
          const eligibility = await fetchUsernameChangeStatus(session.access_token);
          setUsernameEligibility(eligibility);
        } catch {
          setUsernameEligibility(null);
        }
      }
      const remote = await resolveCanonicalProfileAvatar({
        userId: user.id,
        accessToken: session?.access_token,
        supabaseAvatarUrl: p?.avatar_url ?? null,
      });
      setAvatarUrl(remote ? avatarUrlWithCacheBust(remote) : null);
      if (session?.access_token) {
        const mine = await fetchMyPublicProfile(session.access_token);
        if (mine) {
          setBio(mine.bio ?? '');
          setBannerUrl(mine.bannerUrl);
          setLinks(mine.links);
          setPublicLoaded(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, user?.id]);

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

  const onChangeBanner = async () => {
    if (!session?.access_token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Please allow photo library access to choose a banner.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 5],
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]) return;
    setUploadingBanner(true);
    try {
      const url = await uploadMyBanner(session.access_token, picked.assets[0].uri);
      setBannerUrl(url);
    } catch (e) {
      Alert.alert('Could not upload banner', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setUploadingBanner(false);
    }
  };

  const onCropConfirm = async (preparedUri: string) => {
    if (!user?.id) return;
    // Close crop immediately — do not trap the user behind a disabled Cancel while uploading.
    setCropUri(null);
    setUploadingAvatar(true);
    setAvatarUrl(preparedUri);
    try {
      const publicUrl = await uploadMyAvatar(user.id, preparedUri);
      setAvatarUrl(publicUrl);
      // Web Prisma sync is secondary; never keep the spinner for it.
      void persistProfileAvatarEverywhere({
        userId: user.id,
        accessToken: session?.access_token,
        publicUrl,
      }).catch((e) => console.warn('[ProfileEditScreen] avatar web sync', e));
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
      const trimmedUsername = username.trim();
      const usernameChanged = trimmedUsername !== initialUsername.trim();

      if (usernameChanged) {
        if (!session?.access_token) throw new Error('Your session expired. Sign in again.');
        if (!canSubmitUsernameChange(usernameEligibility, trimmedUsername)) {
          const msg =
            usernameEligibility?.reason === 'open_orders'
              ? 'You cannot change your username while you have open orders.'
              : 'Usernames can only be changed once every 60 days.';
          throw new Error(msg);
        }
        await changeUsernameViaApi({ accessToken: session.access_token, username: trimmedUsername });
        setInitialUsername(trimmedUsername);
      }

      // Keep display_name locked to username (same identity as @mentions).
      await updateMyProfile(user.id, {
        display_name: usernameChanged ? trimmedUsername : initialUsername.trim() || trimmedUsername,
      });
      if (publicLoaded && session?.access_token) {
        await saveMyPublicProfile(session.access_token, { bio, bannerUrl, links });
      }
      Alert.alert('Saved', 'Your profile was updated.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const usernameLocked = Boolean(
    usernameEligibility &&
      !usernameEligibility.canChange &&
      !usernameEligibility.canClaimOfficialPlatformUsername,
  );
  const usernameLockHint = (() => {
    if (!usernameEligibility || usernameEligibility.canChange) return null;
    if (usernameEligibility.reason === 'open_orders') {
      return 'Username locked while you have open orders.';
    }
    if (usernameEligibility.lockExpiresAt) {
      const date = new Date(usernameEligibility.lockExpiresAt);
      return `Username can be changed again after ${date.toLocaleDateString()}.`;
    }
    return 'Username can only be changed once every 60 days.';
  })();

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
            sellerActivated={sellerSetup.displayActivated}
            wizardComplete={sellerSetup.wizardComplete}
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
                    {(username || '?').trim().slice(0, 1).toUpperCase() || '?'}
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

          <Text style={styles.label}>Banner</Text>
          <View style={styles.bannerBox}>
            {bannerUrl ? (
              <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={styles.bannerEmpty}>No banner yet</Text>
            )}
            {uploadingBanner ? (
              <View style={styles.avatarLoading}>
                <ActivityIndicator color={colors.gold} />
              </View>
            ) : null}
          </View>
          <View style={styles.bannerActions}>
            <Pressable
              disabled={uploadingBanner || saving || !publicLoaded}
              onPress={() => void onChangeBanner()}
              hitSlop={8}
            >
              <Text style={[styles.changePhotoTxt, (uploadingBanner || !publicLoaded) && { opacity: 0.5 }]}>
                {bannerUrl ? 'Change banner' : 'Add banner'}
              </Text>
            </Pressable>
            {bannerUrl ? (
              <Pressable onPress={() => setBannerUrl(null)} hitSlop={8}>
                <Text style={styles.bannerRemove}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable style={styles.pullsRow} onPress={() => navigation.navigate('PullMediaManage')}>
            <View>
              <Text style={styles.pullsRowTitle}>Manage pull photos & videos</Text>
              <Text style={styles.pullsRowHint}>Show off your best pulls on your profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={[styles.input, usernameLocked && styles.inputDisabled]}
            placeholder="username"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            editable={!usernameLocked}
          />
          {usernameLockHint ? <Text style={styles.lockHint}>{usernameLockHint}</Text> : null}
          <Text style={styles.hint}>Your username is your public name and @handle everywhere.</Text>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            placeholder="What do you sell and break? Where are you based?"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={PROFILE_BIO_MAX}
            value={bio}
            onChangeText={setBio}
            editable={publicLoaded}
          />
          <Text style={styles.counter}>
            {Array.from(bio).length}/{PROFILE_BIO_MAX}
          </Text>

          <Text style={styles.label}>Links</Text>
          {PROFILE_LINK_KEYS.map((key) => (
            <View key={key} style={styles.linkRow}>
              <Text style={styles.linkLabel}>{PROFILE_LINK_LABELS[key]}</Text>
              <TextInput
                style={[styles.input, styles.linkInput]}
                placeholder={PROFILE_LINK_PLACEHOLDERS[key]}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={key === 'website' ? 'url' : 'default'}
                value={links[key] ?? ''}
                onChangeText={(v) => setLinks((prev) => ({ ...prev, [key]: v }))}
                editable={publicLoaded}
              />
            </View>
          ))}
          <Text style={styles.hint}>Handles or full links. Only these networks are shown on your profile.</Text>

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
  pullsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pullsRowTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  pullsRowHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
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
  inputDisabled: { opacity: 0.55 },
  lockHint: { color: colors.textMuted, fontSize: 12, marginTop: -spacing.xs },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: -spacing.xs },
  bannerBox: {
    height: 110,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerEmpty: { color: colors.textMuted, fontSize: 12 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: -spacing.xs },
  bannerRemove: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
  bioInput: { minHeight: 88, textAlignVertical: 'top' },
  counter: { color: colors.textMuted, fontSize: 12, textAlign: 'right', marginTop: -spacing.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkLabel: { width: 76, color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  linkInput: { flex: 1, paddingVertical: spacing.sm, fontSize: 15 },
  primary: {
    marginTop: spacing.lg,
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
});
