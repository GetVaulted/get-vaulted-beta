import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { openHelpArticle } from '../../navigation/openPlatform';
import { siteUrls } from '../../lib/siteUrls';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CommunityGuidelines'>;

const SECTIONS = [
  {
    title: '1. Be respectful',
    bullets: [
      'No harassment, threats, hate speech, doxing, or discrimination.',
      'No spam, brigading, or impersonation of staff or other users.',
      'Keep live chat and messages appropriate for a public marketplace.',
    ],
  },
  {
    title: '2. Buy honestly',
    bullets: [
      'Bid and buy only when you intend to pay — keep your Vault Wallet ready.',
      'Use accurate shipping addresses; do not abuse chargebacks or disputes.',
      'Never ask sellers to accept off-platform payment.',
    ],
  },
  {
    title: '3. Sell and list honestly',
    bullets: [
      'Authentic items only — accurate photos, condition, and grading claims.',
      'Ship on time; use platform labels when provided.',
      'Do not ship layaway orders until paid in full.',
      'See Terms → Seller Responsibility for full seller rules.',
    ],
  },
  {
    title: '4. Live shows & breaks',
    bullets: [
      'Disclose PYT, PYD, random spots, Cards/Helmets format, and pricing before selling.',
      'No false guaranteed-hit claims; honor sold spots and live wins.',
      'Fulfill live sales like marketplace orders.',
    ],
  },
  {
    title: '5. Auctions, trades & layaway',
    bullets: [
      'No shill bidding or auction manipulation.',
      'Honor accepted trades and layaway reservations.',
      'No off-platform deals to evade fees or protections.',
    ],
  },
  {
    title: '6. Payments',
    bullets: [
      'Pay through Get Vaulted checkout and live wallet only.',
      'No PayPal/Venmo/wire/crypto requests unless we authorize in writing.',
      'No phishing or payment fraud.',
    ],
  },
  {
    title: '7. Prohibited content',
    bullets: [
      'Counterfeit, stolen, or illegal goods.',
      'Sexual content involving minors (zero tolerance).',
      'Hate, violence, scams, and infringing material.',
    ],
  },
  {
    title: '8. Moderators & hosts',
    bullets: [
      'Use mute/kick/ban tools fairly — not to retaliate or silence legitimate feedback.',
      'Abuse of moderation may cost hosting or mod privileges.',
    ],
  },
] as const;

export function CommunityGuidelinesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Community Guidelines" subtitle="Standards for everyone" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>
          These guidelines apply to buyers, sellers, hosts, and moderators across The Vault, live shows, trades, and
          chat. They work together with our Terms of Service.
        </Text>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.bullets.map((bullet) => (
              <Text key={bullet} style={styles.bullet}>
                • {bullet}
              </Text>
            ))}
          </View>
        ))}
        <Text style={styles.sectionTitle}>9. Enforcement</Text>
        <Text style={styles.body}>
          We may warn, remove content, mute or ban from live rooms, restrict selling, hold payouts, or suspend accounts.
          Severe or repeat violations may result in permanent removal.
        </Text>
        <Text style={styles.sectionTitle}>10. Reporting</Text>
        <Text style={styles.body}>
          Report violations from profiles, listings, live rooms, chat, or orders. See Reporting & Safety for details.
        </Text>
        <Pressable onPress={() => void Linking.openURL(siteUrls.communityGuidelines())}>
          <Text style={styles.link}>Full guidelines on web →</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ReportingSafety')}>
          <Text style={styles.link}>Reporting & Safety →</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(siteUrls.terms())}>
          <Text style={styles.link}>Terms of Service →</Text>
        </Pressable>
        <Pressable onPress={() => openHelpArticle('sell-obligations', navigation)}>
          <Text style={styles.link}>Help: Seller obligations →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  lead: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
  bullet: { color: colors.textMuted, fontSize: 14, lineHeight: 20, paddingLeft: spacing.xs },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  link: { color: colors.gold, fontWeight: '700', fontSize: 14, marginTop: spacing.xs },
});
