import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createLiveRoom, streamFormatToRoomType } from '../../../api/liveRoomsRepository';
import type { SellerConnectStatusResponse } from '../../../api/stripeConnectRepository';
import { streamCategories } from '../../../data/sellerHubMock';
import { colors, radii, spacing } from '../../../theme';

function defaultScheduledDate(): Date {
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 15) / 15) * 15, 0, 0);
  return d;
}

function formatScheduledDate(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const FORMATS: { id: 'auction' | 'break' | 'hybrid'; label: string }[] = [
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'auction', label: 'Auction' },
  { id: 'break', label: 'Break' },
];

export function ScheduleVaultEventModal({
  visible,
  onClose,
  accessToken,
  sellerConnect,
  scheduleTitle,
  setScheduleTitle,
  scheduleCategory,
  setScheduleCategory,
  streamFormat,
  setStreamFormat,
  onCreated,
  onScheduled,
}: {
  visible: boolean;
  onClose: () => void;
  accessToken?: string;
  sellerConnect: { status: SellerConnectStatusResponse | null; loading: boolean };
  scheduleTitle: string;
  setScheduleTitle: (s: string) => void;
  scheduleCategory: string;
  setScheduleCategory: (label: string) => void;
  streamFormat: 'auction' | 'break' | 'hybrid';
  setStreamFormat: (f: 'auction' | 'break' | 'hybrid') => void;
  onCreated: (roomId: string) => void;
  onScheduled?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [tagline, setTagline] = useState('');
  const [scheduledDate, setScheduledDate] = useState(defaultScheduledDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const liveBlocked =
    sellerConnect.status?.stripeConfigured === true && sellerConnect.status.can_host_live_sales === false;

  const submit = useCallback(async () => {
    if (liveBlocked) {
      Alert.alert('Payout setup required', 'Finish Stripe Connect before scheduling vault events.');
      return;
    }
    if (!accessToken) {
      Alert.alert('Sign in required', 'Sign in to schedule a vault event.');
      return;
    }
    const title = scheduleTitle.trim();
    if (!title) {
      Alert.alert('Title required', 'Name your vault event before scheduling.');
      return;
    }
    if (scheduledDate.getTime() < Date.now() + 60_000) {
      Alert.alert('Pick a future time', 'Schedule at least one minute from now.');
      return;
    }
    setBusy(true);
    try {
      const { id } = await createLiveRoom(accessToken, {
        title,
        description: tagline.trim() || undefined,
        category: scheduleCategory,
        roomType: streamFormatToRoomType(streamFormat),
        scheduledStartAt: scheduledDate.toISOString(),
        teamBoardLeague: streamFormat === 'break' ? 'nba' : undefined,
      });
      onScheduled?.();
      onClose();
      Alert.alert(
        'Vault event scheduled',
        `Your show is set for ${formatScheduledDate(scheduledDate)}. Go live from that event's command center when you are ready.`,
        [
          { text: 'Stay on events', style: 'cancel' },
          { text: 'Enter command center', onPress: () => onCreated(id) },
        ],
      );
    } catch (e) {
      Alert.alert('Could not schedule', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [
    accessToken,
    scheduleCategory,
    liveBlocked,
    onClose,
    onCreated,
    scheduleTitle,
    scheduledDate,
    streamFormat,
    tagline,
  ]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Schedule Vault Event</Text>
            <Text style={styles.headerSub}>Going live happens inside the command center</Text>
          </View>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Event title</Text>
          <TextInput
            value={scheduleTitle}
            onChangeText={setScheduleTitle}
            placeholder="e.g. Nocturne wax · Session XII"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.label}>Tagline (optional)</Text>
          <TextInput
            value={tagline}
            onChangeText={setTagline}
            placeholder="One line collectors will feel"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {streamCategories.map((c) => {
              const on = scheduleCategory === c.label;
              return (
                <Pressable
                  key={c.label}
                  onPress={() => setScheduleCategory(c.label)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.label}>Format</Text>
          <View style={styles.chips}>
            {FORMATS.map((f) => {
              const on = streamFormat === f.id;
              return (
                <Pressable key={f.id} onPress={() => setStreamFormat(f.id)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>Start time</Text>
          <Pressable style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="time-outline" size={18} color={colors.gold} />
            <Text style={styles.dateTxt}>{formatScheduledDate(scheduledDate)}</Text>
          </Pressable>
          {showDatePicker ? (
            <DateTimePicker
              value={scheduledDate}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={(_, d) => {
                if (Platform.OS === 'android') setShowDatePicker(false);
                if (d) setScheduledDate(d);
              }}
            />
          ) : null}
          {Platform.OS === 'ios' && showDatePicker ? (
            <Pressable style={styles.donePicker} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.donePickerTxt}>Done</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Pressable
            style={[styles.primary, (liveBlocked || busy) && styles.primaryOff]}
            onPress={() => void submit()}
            disabled={busy || liveBlocked}
          >
            {busy ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Ionicons name="calendar" size={20} color={colors.background} />
                <Text style={styles.primaryTxt}>Schedule event</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  form: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  chipTxt: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTxtOn: { color: colors.gold },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  dateTxt: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  donePicker: { alignSelf: 'flex-end', padding: spacing.sm },
  donePickerTxt: { fontSize: 15, fontWeight: '800', color: colors.gold },
  footer: { paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.gold,
  },
  primaryOff: { opacity: 0.5 },
  primaryTxt: { fontSize: 16, fontWeight: '900', color: colors.background },
});
