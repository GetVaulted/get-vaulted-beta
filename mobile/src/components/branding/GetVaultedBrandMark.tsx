import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

type Size = 'splash' | 'welcome' | 'compact';

const SIZES: Record<
  Size,
  { word: number; tag: number; gap: number; letter: number; weight: '700' | '800' | '900' }
> = {
  splash: { word: 30, tag: 14, gap: 14, letter: 3.5, weight: '900' },
  welcome: { word: 28, tag: 15, gap: 12, letter: 2.8, weight: '800' },
  compact: { word: 22, tag: 13, gap: 8, letter: 2, weight: '800' },
};

export function GetVaultedBrandMark({
  size = 'welcome',
  tagline,
}: {
  size?: Size;
  tagline?: string;
}) {
  const s = SIZES[size];
  return (
    <View style={styles.wrap}>
      <Text
        style={[
          styles.wordmark,
          {
            fontSize: s.word,
            letterSpacing: s.letter,
            fontWeight: s.weight,
          },
        ]}
      >
        GET VAULTED
      </Text>
      {tagline ? (
        <Text style={[styles.tag, { fontSize: s.tag, marginTop: s.gap }]}>{tagline}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  wordmark: {
    color: colors.textPrimary,
    textAlign: 'center',
    textShadowColor: 'rgba(212, 175, 55, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  tag: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
    fontWeight: '500',
  },
});
