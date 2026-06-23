import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
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
import { liveChatUsernameInitial } from '../../lib/liveChatAvatar';
import {
  getActiveMentionQuery,
  insertMentionAtQuery,
} from '../../lib/mentions/parseMentions';
import { colors, spacing } from '../../theme';

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
};

const AVATAR_SIZE = 52;

function truncateHandle(username: string, max = 11): string {
  const label = `@${username}`;
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

function MentionStripAvatar({ user }: { user: MentionSearchUser }) {
  const [imgFailed, setImgFailed] = useState(false);
  const uri = user.image?.trim();
  if (uri && !imgFailed) {
    return (
      <Image
        source={{ uri }}
        style={styles.stripAvatar}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <View style={styles.stripAvatarFallback}>
      <Text style={styles.stripAvatarInitial}>{liveChatUsernameInitial(user.username)}</Text>
    </View>
  );
}

export const MentionComposerInput = forwardRef<MentionComposerInputHandle, Props>(function MentionComposerInput(
  { value, onChangeText, accessToken, liveRoomId, onSubmitEditing, ...inputProps },
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
      {open && useStripPicker ? (
        <View style={styles.stripWrap} pointerEvents="box-none">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.stripContent}
          >
            {results.map((user) => (
              <Pressable key={user.id} style={styles.stripItem} onPress={() => pick(user)}>
                <MentionStripAvatar user={user} />
                <Text style={styles.stripHandle} numberOfLines={1}>
                  {truncateHandle(user.username)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : open ? (
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
        onSubmitEditing={handleSubmitEditing}
        {...inputProps}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  stripWrap: {
    position: 'absolute',
    bottom: '100%',
    left: -8,
    right: -8,
    marginBottom: 8,
    zIndex: 40,
  },
  stripContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 4,
  },
  stripItem: {
    width: 68,
    alignItems: 'center',
    gap: 6,
  },
  stripAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  stripAvatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,30,36,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  stripAvatarInitial: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 16,
  },
  stripHandle: {
    maxWidth: 68,
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
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
