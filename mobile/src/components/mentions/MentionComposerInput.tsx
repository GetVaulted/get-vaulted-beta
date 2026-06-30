import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
import {
  getActiveMentionQuery,
  insertMentionAtQuery,
} from '../../lib/mentions/parseMentions';
import { colors, spacing } from '../../theme';
import { MentionSuggestionStrip } from './MentionSuggestionStrip';

export type MentionSuggestionsState = {
  open: boolean;
  results: MentionSearchUser[];
  pick: (user: MentionSearchUser) => void;
};

export type MentionComposerInputHandle = {
  blur: () => void;
  focus: () => void;
  dismissSuggestions: () => void;
};

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  accessToken?: string;
  liveRoomId?: string;
  /** Render avatar strip above the composer (avoids clipping inside fixed-height pill). */
  onSuggestionsChange?: (state: MentionSuggestionsState | null) => void;
};

export const MentionComposerInput = forwardRef<MentionComposerInputHandle, Props>(function MentionComposerInput(
  { value, onChangeText, accessToken, liveRoomId, onSuggestionsChange, onSubmitEditing, ...inputProps },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<MentionSearchUser[]>([]);
  const [open, setOpen] = useState(false);
  const active = getActiveMentionQuery(value, cursor);
  const useStripPicker = Boolean(liveRoomId?.trim() && accessToken);

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
    if (!accessToken || !active) {
      dismissSuggestions();
      return;
    }
    if (!useStripPicker && active.query.length < 1) {
      dismissSuggestions();
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const task = useStripPicker
        ? searchLiveRoomMentionUsers(accessToken, liveRoomId!, active.query)
        : searchMentionUsers(accessToken, active.query);
      void task
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
  }, [accessToken, active?.query, active?.start, active?.end, liveRoomId, useStripPicker]);

  const pick = useCallback(
    (user: MentionSearchUser) => {
      if (!active) return;
      const next = insertMentionAtQuery(value, active, user.username);
      onChangeText(next.text);
      dismissSuggestions();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        setCursor(next.cursor);
      });
    },
    [active, onChangeText, value],
  );

  useEffect(() => {
    if (!onSuggestionsChange) return;
    if (open && useStripPicker && results.length > 0) {
      onSuggestionsChange({ open: true, results, pick });
      return;
    }
    onSuggestionsChange(null);
  }, [onSuggestionsChange, open, pick, results, useStripPicker]);

  const handleSubmitEditing: NonNullable<TextInputProps['onSubmitEditing']> = (event) => {
    dismissSuggestions();
    onSubmitEditing?.(event);
  };

  return (
    <View style={styles.wrap}>
      {open && useStripPicker && !onSuggestionsChange ? (
        <MentionSuggestionStrip users={results} onPick={pick} />
      ) : open && !useStripPicker ? (
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
          setCursor((prev) => {
            const delta = t.length - value.length;
            if (delta === 1 && prev === value.length) return t.length;
            if (delta === -1 && prev === value.length) return t.length;
            return prev;
          });
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
    borderRadius: 12,
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
