import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
import {
  getActiveMentionQuery,
  insertMentionAtQuery,
} from '../../lib/mentions/parseMentions';
import { colors, radii, spacing } from '../../theme';

export type MentionComposerInputHandle = {
  blur: () => void;
  focus: () => void;
  dismissSuggestions: () => void;
};

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  accessToken?: string;
};

export const MentionComposerInput = forwardRef<MentionComposerInputHandle, Props>(function MentionComposerInput(
  { value, onChangeText, accessToken, onSubmitEditing, ...inputProps },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<MentionSearchUser[]>([]);
  const [open, setOpen] = useState(false);
  const active = getActiveMentionQuery(value, cursor);

  const dismissSuggestions = () => {
    setOpen(false);
    setResults([]);
  };

  useImperativeHandle(ref, () => ({
    blur: () => {
      dismissSuggestions();
      inputRef.current?.blur();
    },
    focus: () => {
      inputRef.current?.focus();
    },
    dismissSuggestions,
  }));

  useEffect(() => {
    if (!accessToken || !active || active.query.length < 1) {
      dismissSuggestions();
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
          if (!cancelled) dismissSuggestions();
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [accessToken, active?.query, active?.start, active?.end]);

  const pick = (user: MentionSearchUser) => {
    if (!active) return;
    const next = insertMentionAtQuery(value, active, user.username);
    onChangeText(next.text);
    dismissSuggestions();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      setCursor(next.cursor);
    });
  };

  const handleSubmitEditing: NonNullable<TextInputProps['onSubmitEditing']> = (event) => {
    dismissSuggestions();
    onSubmitEditing?.(event);
  };

  return (
    <View style={styles.wrap}>
      {open ? (
        <View style={styles.dropdown}>
          <FlatList
            keyboardShouldPersistTaps="always"
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
        onSubmitEditing={handleSubmitEditing}
        {...inputProps}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: 6,
    maxHeight: 160,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0c0c10',
    overflow: 'hidden',
    zIndex: 30,
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  rowUser: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 13,
  },
});
