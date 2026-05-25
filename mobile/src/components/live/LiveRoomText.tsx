import { Text, type TextProps } from 'react-native';
import { LIVE_ROOM_TEXT_PROPS } from '../../lib/liveRoomUiScale';

/** Live-room overlay text — fixed scale; does not follow system dynamic type. */
export function LiveRoomText(props: TextProps) {
  return <Text {...LIVE_ROOM_TEXT_PROPS} {...props} />;
}
