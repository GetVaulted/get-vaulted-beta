import { Text, type TextStyle } from 'react-native';
import type { MessageMentionDTO } from '../../lib/mentions/parseMentions';
import { segmentMessageWithMentions } from '../../lib/mentions/parseMentions';
import { colors } from '../../theme';

type Props = {
  body: string;
  mentions?: MessageMentionDTO[];
  style?: TextStyle;
  mentionStyle?: TextStyle;
  onPressUser?: (userId: string, username: string) => void;
};

export function MentionText({ body, mentions = [], style, mentionStyle, onPressUser }: Props) {
  const segments = segmentMessageWithMentions(body, mentions);
  const mentionStyles: TextStyle = {
    fontWeight: '800',
    color: colors.gold,
    ...(mentionStyle ?? {}),
  };

  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <Text key={`t-${i}`}>{seg.value}</Text>;
        }
        const label = `@${seg.username}`;
        if (seg.userId && onPressUser) {
          return (
            <Text
              key={`m-${i}`}
              style={mentionStyles}
              onPress={() => onPressUser(seg.userId!, seg.username)}
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
