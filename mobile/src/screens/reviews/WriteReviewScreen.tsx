import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { REVIEW_QUICK_TAGS } from '../../data/reviewQuickTags';
import { addReview, hasReviewedReference } from '../../platform/platformStore';
import { emitNotificationBadgeChanged } from '../../platform/notificationEvents';
import { notifyReviewReceived } from '../../platform/notificationStore';
import type { ReviewType } from '../../platform/types';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'WriteReview'>;

export function WriteReviewScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { reviewType, referenceId, subjectUserId, subjectDisplayName } = route.params;
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [already, setAlready] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void hasReviewedReference(user.id, referenceId, reviewType).then(setAlready);
  }, [user?.id, referenceId, reviewType]);

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = async () => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Sign in to leave a vault review.');
      return;
    }
    if (rating < 1) {
      Alert.alert('Rating required', 'Select a star rating.');
      return;
    }
    setBusy(true);
    try {
      await addReview({
        authorId: user.id,
        subjectUserId,
        rating,
        body: body.trim() || tags.join(' · ') || 'Great vault experience.',
        tags,
        reviewType,
        referenceId,
      });
      await notifyReviewReceived(subjectUserId, user.email ?? 'A collector', rating, referenceId);
      emitNotificationBadgeChanged();
      Alert.alert('Review submitted', 'Your review is on their vault profile.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const title =
    reviewType === 'trade'
      ? 'Review trade partner'
      : reviewType === 'seller_to_buyer'
        ? 'Review buyer'
        : 'Review seller';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title={title}
        subtitle={subjectDisplayName ?? 'Vault reputation'}
        onBack={() => navigation.goBack()}
      />
      {already ? (
        <Text style={styles.muted}>You already reviewed this transaction.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Star rating</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)}>
                <Text style={[styles.star, n <= rating && styles.starOn]}>★</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Quick tags</Text>
          <View style={styles.chips}>
            {REVIEW_QUICK_TAGS.map((t) => (
              <Pressable key={t} onPress={() => toggleTag(t)} style={[styles.chip, tags.includes(t) && styles.chipOn]}>
                <Text style={[styles.chipTxt, tags.includes(t) && styles.chipTxtOn]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Written review</Text>
          <TextInput
            style={[styles.input, styles.area]}
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Share how the deal went…"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.ref}>Reference · {referenceId.slice(0, 8)}…</Text>
          <Pressable style={[styles.btn, busy && styles.btnOff]} disabled={busy} onPress={() => void submit()}>
            <Text style={styles.btnTxt}>Submit review</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
  stars: { flexDirection: 'row', gap: spacing.sm },
  star: { fontSize: 32, color: colors.border },
  starOn: { color: colors.gold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  chipTxt: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  chipTxtOn: { color: colors.gold },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  area: { minHeight: 100, textAlignVertical: 'top' },
  ref: { fontSize: 11, color: colors.textMuted },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnOff: { opacity: 0.6 },
  btnTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
  muted: { color: colors.textMuted, marginTop: spacing.xl },
});
