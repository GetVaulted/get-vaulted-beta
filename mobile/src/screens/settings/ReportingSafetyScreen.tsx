import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { siteUrls } from '../../lib/siteUrls';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportingSafety'>;

export function ReportingSafetyScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Reporting & Safety" subtitle="How to get help" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>
          Report behavior that violates our Community Guidelines or Terms of Service so our team can review and take
          action.
        </Text>

        <Text style={styles.sectionTitle}>In-app reporting</Text>
        <Text style={styles.body}>
          Use report buttons on profiles, listings, live rooms, chat messages, and orders. Reports are reviewed by our
          trust & safety team.
        </Text>

        <Text style={styles.sectionTitle}>Urgent safety issues</Text>
        <Text style={styles.body}>
          If someone is in immediate danger, contact local emergency services first. Then email support@shopgetvaulted.com
          with subject line URGENT SAFETY and include links, usernames, and timestamps when possible.
        </Text>

        <Text style={styles.sectionTitle}>Fraud and payment abuse</Text>
        <Text style={styles.body}>
          Report suspected fraud, chargeback abuse, or off-platform payment requests through in-app reports or support.
          Do not send payment outside Get Vaulted checkout unless explicitly allowed in writing.
        </Text>

        <Text style={styles.link} onPress={() => void Linking.openURL(siteUrls.reportingSafety())}>
          Full reporting policy on web
        </Text>
        <Text style={styles.link} onPress={() => navigation.navigate('CommunityGuidelines')}>
          Community Guidelines
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  lead: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  link: { color: colors.gold, fontWeight: '700', fontSize: 14, marginTop: spacing.xs },
});
