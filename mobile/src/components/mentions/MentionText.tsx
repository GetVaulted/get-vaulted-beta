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
  /** When true, render mention segments for nesting inside a parent Text (live chat rows). */
  inline?: boolean;
};

export function MentionText({ body, mentions = [], style, mentionStyle, onPressUser, inline = false }: Props) {
  const segments = segmentMessageWithMentions(body, mentions);
  const mentionStyles: StyleProp<TextStyle> = [
    { fontWeight: '800', color: colors.mention },
    mentionStyle,
  ];

  const nodes = segments.map((seg, i) => {
    if (seg.type === 'text') {
      return (
        <Text key={`t-${i}`} style={style}>
          {seg.value}
        </Text>
      );
    }
    const label = `@${seg.username}`;
    if (onPressUser) {
      return (
        <Text
          key={`m-${i}`}
          style={[style, mentionStyles]}
          onPress={() => onPressUser(seg.userId ?? '', seg.username)}
        >
          {label}
        </Text>
      );
    }
    return (
      <Text key={`m-${i}`} style={[style, mentionStyles]}>
        {label}
      </Text>
    );
  });

  if (inline) return nodes;

  return <Text style={style}>{nodes}</Text>;
}
