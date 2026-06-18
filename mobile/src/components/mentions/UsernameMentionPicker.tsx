import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { searchMentionUsers, type MentionSearchUser } from '../../api/mentionSearchRepository';
import { getActiveMentionQuery } from '../../lib/mentions/parseMentions';
import { colors, radii, spacing } from '../../theme';

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  accessToken?: string;
  onSelectUser: (user: MentionSearchUser) => void;
};

/** @username search with mention-style autocomplete — pick a user from the dropdown. */
export function UsernameMentionPicker({
  value,
  onChangeText,
  accessToken,
  onSelectUser,
  placeholder = '@username',
  editable = true,
  ...inputProps
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<MentionSearchUser[]>([]);
  const [open, setOpen] = useState(false);
  const active = getActiveMentionQuery(value, cursor);

  useEffect(() => {
    if (!accessToken || !editable || !active || active.query.length < 1) {
      setOpen(false);
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void searchMentionUsers(accessToken, active.query)
        .then((users) => {
          if (cancelled) return;
          setResults(users);
          setOpen(users.length > 0);
        })
        .catch(() => {
          if (!cancelled) {
            setOpen(false);
            setResults([]);
          }
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [accessToken, active?.query, active?.start, active?.end, editable]);

  const pick = (user: MentionSearchUser) => {
    setOpen(false);
    setResults([]);
    onChangeText('');
    setCursor(0);
    onSelectUser(user);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <View style={styles.wrap}>
      {open ? (
        <View style={styles.dropdown}>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={results}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => pick(item)}>
                <Text style={styles.rowUser}>@{item.username}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => {
          onChangeText(t);
          setCursor(t.length);
        }}
        onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 0 },
  dropdown: {
    marginBottom: 6,
    maxHeight: 180,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0c0c10',
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  rowUser: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 14,
  },
  input: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
});
