import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { getSupportTicket } from '../../platform/platformStore';
import type { SupportTicket } from '../../platform/types';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportTicketDetail'>;

export function SupportTicketDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setTicket(await getSupportTicket(route.params.ticketId));
      setLoading(false);
    })();
  }, [route.params.ticketId]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Support ticket" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={colors.gold} />
      ) : ticket ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.statusPill}>
            <Text style={styles.statusTxt}>{ticket.status.replace('_', ' ')}</Text>
          </View>
          <Text style={styles.subject}>{ticket.subject}</Text>
          <Text style={styles.meta}>#{ticket.id}</Text>
          <Text style={styles.body}>{ticket.message}</Text>
        </ScrollView>
      ) : (
        <Text style={styles.empty}>Ticket not found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  statusTxt: { fontSize: 11, fontWeight: '800', color: colors.gold, textTransform: 'uppercase' },
  subject: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted },
  body: { fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  empty: { color: colors.textMuted },
});
