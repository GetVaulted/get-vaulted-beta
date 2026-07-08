import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { siteUrls } from '../../lib/siteUrls';
import { colors, spacing } from '../../theme';

type LegalLink = {
  key: keyof typeof siteUrls;
  label: string;
};

/** Apple-friendly legal links — opens public policy pages on shopgetvaulted.com. */
const LEGAL_FOOTER_LINKS: LegalLink[] = [
  { key: 'terms', label: 'Terms of Service' },
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'communityGuidelines', label: 'Community Guidelines' },
  { key: 'prohibitedItems', label: 'Prohibited Items' },
  { key: 'accountDeletion', label: 'Account Deletion' },
];

export function LegalFooterLinks({ variant = 'default' }: { variant?: 'default' | 'onDark' }) {
  const onDark = variant === 'onDark';
  const muted = onDark ? 'rgba(255,255,255,0.45)' : colors.textMuted;
  const linkColor = colors.gold;

  const open = (key: keyof typeof siteUrls) => {
    void Linking.openURL(siteUrls[key]());
  };

  return (
    <View style={styles.wrap} accessibilityRole="none">
      <Text style={[styles.kicker, { color: muted }]}>Legal & policies</Text>
      <View style={styles.linksRow}>
        {LEGAL_FOOTER_LINKS.map((item, index) => (
          <View key={item.key} style={styles.linkSlot}>
            {index > 0 ? <Text style={[styles.sep, { color: muted }]}>·</Text> : null}
            <Pressable
              onPress={() => open(item.key)}
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={item.label}
            >
              <Text style={[styles.link, { color: linkColor }]}>{item.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Text style={[styles.hint, { color: muted }]}>
        Delete your account anytime from Account → Settings → Delete account.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    rowGap: spacing.xs,
    columnGap: 2,
    paddingHorizontal: spacing.xs,
  },
  linkSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sep: {
    fontSize: 12,
    marginHorizontal: 6,
    fontWeight: '700',
  },
  link: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textDecorationLine: 'underline',
  },
  hint: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    maxWidth: 340,
  },
});
