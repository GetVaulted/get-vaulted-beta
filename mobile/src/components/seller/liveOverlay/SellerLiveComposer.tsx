import { useRef, type ReactNode, type RefObject } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import {
  COMPOSER_BAR_H,
  FloatingChatComposer,
} from '../../live/floatingLiveChat';
import type { MentionComposerInputHandle } from '../../mentions/MentionComposerInput';
import { colors } from '../../../theme';

export function SellerLiveComposer({
  bottom,
  left,
  rightEdge,
  value,
  onChangeText,
  onSend,
  sendDisabled,
  inputDisabled,
  accessToken,
  leadingAccessory,
  placeholder,
  inputRef,
}: {
  bottom: number;
  left: number;
  rightEdge: number;
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void | Promise<void>;
  sendDisabled?: boolean;
  inputDisabled?: boolean;
  accessToken?: string;
  leadingAccessory?: ReactNode;
  placeholder?: string;
  inputRef?: RefObject<MentionComposerInputHandle | null>;
}) {
  const glow = useRef(new Animated.Value(0)).current;
  const active = value.trim().length > 0;

  return (
    <Animated.View
      style={[
        styles.host,
        {
          bottom,
          left,
          right: rightEdge,
          height: COMPOSER_BAR_H,
          shadowOpacity: active ? 0.55 : 0.28,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.composerSlot}>
        <Animated.View
          style={[
            styles.glowRing,
            {
              opacity: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [active ? 0.45 : 0.15, 0.9],
              }),
            },
          ]}
          pointerEvents="none"
        />
        <FloatingChatComposer
          bottom={0}
          left={0}
          rightEdge={0}
          value={value}
          onChangeText={(t) => {
            onChangeText(t);
            if (t.trim()) {
              Animated.timing(glow, { toValue: 0.55, duration: 200, useNativeDriver: true }).start();
            }
          }}
          onSend={sendDisabled ? () => undefined : onSend}
          sendDisabled={sendDisabled}
          inputDisabled={inputDisabled}
          placeholder={placeholder}
          accessToken={accessToken}
          leadingAccessory={leadingAccessory}
          inputRef={inputRef}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
    shadowColor: colors.gold,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  composerSlot: {
    flex: 1,
    minWidth: 0,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
});
