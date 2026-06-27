import type { ReactNode } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { openHelpArticle } from '../../navigation/openPlatform';
import { siteUrls } from '../../lib/siteUrls';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportingSafety'>;

const REPORT_REASONS = [
  'Harassment',
  'Counterfeit / fake item',
  'Scam / fraud',
  'Spam',
  'Inappropriate content',
  'Fake bids / shill bidding',
  'Seller misconduct',
  'Buyer misconduct',
  'IP / copyright violation',
  'Other',
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ReportingSafetyScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Reporting & Safety" subtitle="How to get help" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>
          Report behavior that violates our Community Guidelines or Terms of Service. You must be signed in to submit a
          report. False or retaliatory reports may affect your account.
        </Text>

        <Section title="Report reasons">
          <Text style={styles.body}>When you report, choose the closest reason and add optional details:</Text>
          {REPORT_REASONS.map((reason) => (
            <Text key={reason} style={styles.bullet}>
              • {reason}
            </Text>
          ))}
        </Section>

        <Section title="Where to report">
          <Text style={styles.body}>
            <Text style={styles.bold}>Profiles</Text> — open a user profile → Report.{'\n'}
            <Text style={styles.bold}>Listings</Text> — product detail → Report.{'\n'}
            <Text style={styles.bold}>Live shows</Text> — Report show from the live room for room-wide issues.{'\n'}
            <Text style={styles.bold}>Live chat</Text> — tap a username or message → Report.{'\n'}
            <Text style={styles.bold}>Orders</Text> — order detail → Report order issue.
          </Text>
        </Section>

        <Section title="After you report">
          <Text style={styles.body}>
            Our trust & safety team reviews reports and may remove content, restrict accounts, hold payouts, or ban users
            from live rooms. You may not receive individual outcome details when privacy rules apply.
          </Text>
        </Section>

        <Section title="Order problems">
          <Text style={styles.body}>
            Shipping delays or item condition: try refund request or message the seller first. Fraud, counterfeits, or
            policy violations: submit a report with order ID, photos, and tracking in the details field.
          </Text>
        </Section>

        <Section title="Fraud & off-platform payments">
          <Text style={styles.body}>
            Never pay outside Get Vaulted checkout or live wallet unless we authorize it in writing. Report Scam / fraud
            if someone asks for PayPal, Venmo, wire, or crypto instead of platform checkout.
          </Text>
        </Section>

        <Section title="Urgent safety">
          <Text style={styles.body}>
            If someone is in immediate danger, contact local emergency services first (911 in the U.S.). Then email
            support@shopgetvaulted.com with subject URGENT SAFETY — include usernames, room links, timestamps, and
            screenshots.
          </Text>
        </Section>

        <Pressable onPress={() => openHelpArticle('trust-report', navigation)}>
          <Text style={styles.link}>Help article: Report a user or listing →</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('CommunityGuidelines')}>
          <Text style={styles.link}>Community Guidelines →</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(siteUrls.reportingSafety())}>
          <Text style={styles.link}>Full policy on web →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  lead: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  bold: { color: colors.textSecondary, fontWeight: '700' },
  bullet: { color: colors.textMuted, fontSize: 13, lineHeight: 20, paddingLeft: spacing.xs },
  link: { color: colors.gold, fontWeight: '700', fontSize: 14 },
});
