import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import {
  searchLiveRoomMentionUsers,
  searchMentionUsers,
  type MentionSearchUser,
} from '../../api/mentionSearchRepository';
import { getActiveMentionQuery } from '../../lib/mentions/parseMentions';
import { colors, radii, spacing } from '../../theme';

const PLAIN_USERNAME_PATTERN = /^[a-z0-9_]{1,20}$/;

function resolveUsernameSearchQuery(
  value: string,
  cursor: number,
  plainUsernameSearch: boolean,
): string | null {
  const active = getActiveMentionQuery(value, cursor);
  if (active?.query) return active.query;
  if (!plainUsernameSearch) return null;
  const stripped = value.trim().replace(/^@+/, '').toLowerCase();
  if (!PLAIN_USERNAME_PATTERN.test(stripped)) return null;
  return stripped;
}

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  accessToken?: string;
  liveRoomId?: string;
  /** Allow typing a username without a leading @ (moderator assign). */
  plainUsernameSearch?: boolean;
  onSelectUser: (user: MentionSearchUser) => void;
};

/** @username search with mention-style autocomplete — pick a user from the dropdown. */
export function UsernameMentionPicker({
  value,
  onChangeText,
  accessToken,
  liveRoomId,
  plainUsernameSearch = false,
  onSelectUser,
  placeholder = '@username',
  editable = true,
  ...inputProps
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<MentionSearchUser[]>([]);
  const [open, setOpen] = useState(false);
  const searchQuery = resolveUsernameSearchQuery(value, cursor, plainUsernameSearch);
  const useRoomSearch = Boolean(liveRoomId?.trim() && accessToken);

  useEffect(() => {
    if (!accessToken || !editable || !searchQuery) {
      setOpen(false);
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const task = useRoomSearch
        ? searchLiveRoomMentionUsers(accessToken, liveRoomId!, searchQuery)
        : searchMentionUsers(accessToken, searchQuery);
      void task
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
  }, [accessToken, editable, liveRoomId, searchQuery, useRoomSearch]);

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
          {results.map((item) => (
            <Pressable key={item.id} style={styles.row} onPress={() => pick(item)}>
              <Text style={styles.rowUser}>@{item.username}</Text>
            </Pressable>
          ))}
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
  wrap: { minWidth: 0, zIndex: 20 },
  dropdown: {
    marginBottom: 6,
    maxHeight: 180,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0c0c10',
    overflow: 'hidden',
    zIndex: 30,
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
