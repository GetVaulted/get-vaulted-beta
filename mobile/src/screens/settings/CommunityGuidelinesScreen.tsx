import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { siteUrls } from '../../lib/siteUrls';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CommunityGuidelines'>;

const SECTIONS = [
  {
    title: 'Be respectful',
    bullets: [
      'Do not harass, threaten, dox, or discriminate against others.',
      'Keep chat and messages appropriate for a public marketplace.',
      'Do not spam, brigade, or manipulate engagement metrics.',
    ],
  },
  {
    title: 'Sell and buy honestly',
    bullets: [
      'List only authentic, legal items with accurate photos and descriptions.',
      'Disclose damage, alterations, restoration, and grading limitations.',
      'Honor published break rules, auction terms, and shipping timelines.',
    ],
  },
  {
    title: 'Livestream conduct',
    bullets: [
      'Hosts must clearly explain break formats, odds, and fulfillment before sales.',
      'No misleading guaranteed-hit claims unless expressly disclosed.',
      'Follow moderator instructions and platform safety tools during live events.',
    ],
  },
  {
    title: 'Prohibited content',
    bullets: [
      'Counterfeit, stolen, or infringing goods.',
      'Illegal drugs, weapons, or restricted regulated items.',
      'Sexually explicit content, hate speech, or glorification of violence.',
      'Scams, phishing, off-platform payment solicitation, or identity fraud.',
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
          Get Vaulted is built for collectors who want fair markets, transparent live selling, and respectful
          communities. These guidelines apply to buyers, sellers, hosts, and moderators.
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
        <Text style={styles.sectionTitle}>Enforcement</Text>
        <Text style={styles.body}>
          We may remove content, mute or ban users, withhold payouts, cancel listings, or suspend accounts when these
          guidelines or our Terms of Service are violated.
        </Text>
        <Pressable onPress={() => void Linking.openURL(siteUrls.terms())}>
          <Text style={styles.link}>Read Terms of Service</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ReportingSafety')}>
          <Text style={styles.link}>Reporting & Safety</Text>
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
