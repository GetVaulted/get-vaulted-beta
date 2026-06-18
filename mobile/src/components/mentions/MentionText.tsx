import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { MessageMentionDTO } from '../../lib/mentions/parseMentions';
import { segmentMessageWithMentions } from '../../lib/mentions/parseMentions';
import { colors } from '../../theme';

type Props = {
  body: string;
  mentions?: MessageMentionDTO[];
  style?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
  onPressUser?: (userId: string, username: string) => void;
};

export function MentionText({ body, mentions = [], style, mentionStyle, onPressUser }: Props) {
  const segments = segmentMessageWithMentions(body, mentions);
  const mentionStyles: StyleProp<TextStyle> = [
    { fontWeight: '800', color: colors.mention },
    mentionStyle,
  ];

  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <Text key={`t-${i}`}>{seg.value}</Text>;
        }
        const label = `@${seg.username}`;
        if (onPressUser) {
          return (
            <Text
              key={`m-${i}`}
              style={mentionStyles}
              onPress={() => onPressUser(seg.userId ?? '', seg.username)}
            >
              {label}
            </Text>
          );
        }
        return (
          <Text key={`m-${i}`} style={mentionStyles}>
            {label}
          </Text>
        );
      })}
    </Text>
  );
}
