import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { searchModeratorUsers, type ModeratorSearchUser } from '../../../api/moderatorSearchRepository';
import { colors, radii, spacing } from '../../../theme';

type Props = {
  accessToken?: string;
  tipModeratorId: string | null;
  tipModeratorUsername: string;
  tipsToModerator: boolean;
  onModeratorChange: (id: string | null, username: string) => void;
  onTipsToModeratorChange: (value: boolean) => void;
  disabled?: boolean;
};

export function LiveShowTipModeratorFields({
  accessToken,
  tipModeratorId,
  tipModeratorUsername,
  tipsToModerator,
  onModeratorChange,
  onTipsToModeratorChange,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<ModeratorSearchUser[]>([]);

  const search = useCallback(async () => {
    if (!accessToken) {
      setMatches([]);
      return;
    }
    setMatches(await searchModeratorUsers(accessToken, query));
  }, [accessToken, query]);

  useEffect(() => {
    const t = setTimeout(() => void search(), 280);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Show moderator (optional)</Text>
      {tipModeratorId ? (
        <View style={styles.selectedRow}>
          <Text style={styles.selectedUser}>@{tipModeratorUsername || 'moderator'}</Text>
          <Pressable
            disabled={disabled}
            onPress={() => {
              onModeratorChange(null, '');
              onTipsToModeratorChange(false);
              setQuery('');
              setMatches([]);
            }}
          >
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            editable={!disabled}
            placeholder="Search username or email"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          {matches.map((u) => (
            <Pressable
              key={u.id}
              disabled={disabled}
              style={styles.matchRow}
              onPress={() => {
                onModeratorChange(u.id, u.username);
                setQuery('');
                setMatches([]);
              }}
            >
              <Text style={styles.matchUser}>@{u.username}</Text>
              <Text style={styles.matchEmail}>{u.email}</Text>
            </Pressable>
          ))}
        </>
      )}

      {tipModeratorId ? (
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Send 100% of tips to moderator</Text>
            <Text style={styles.toggleSub}>
              Get Vaulted does not take a platform fee from tips. Standard payment processing still applies.
            </Text>
          </View>
          <Switch
            value={tipsToModerator}
            disabled={disabled}
            onValueChange={onTipsToModeratorChange}
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(212,175,55,0.45)' }}
            thumbColor={tipsToModerator ? colors.gold : colors.textMuted}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  selectedUser: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  remove: { fontSize: 12, fontWeight: '800', color: '#ffb4b4' },
  matchRow: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  matchUser: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  matchEmail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  toggleTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  toggleSub: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 4 },
});
