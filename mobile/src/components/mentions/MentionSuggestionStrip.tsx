import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MentionSearchUser } from '../../api/mentionSearchRepository';
import { liveChatUsernameInitial } from '../../lib/liveChatAvatar';
import { colors } from '../../theme';

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

type Props = {
  users: MentionSearchUser[];
  onPick: (user: MentionSearchUser) => void;
};

export function MentionSuggestionStrip({ users, onPick }: Props) {
  if (users.length === 0) return null;
  return (
    <View style={styles.stripWrap} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.stripContent}
      >
        {users.map((user) => (
          <Pressable key={user.id} style={styles.stripItem} onPress={() => onPick(user)}>
            <MentionStripAvatar user={user} />
            <Text style={styles.stripHandle} numberOfLines={1}>
              {truncateHandle(user.username)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stripWrap: {
    width: '100%',
    marginBottom: 8,
    zIndex: 50,
    elevation: 50,
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
});
