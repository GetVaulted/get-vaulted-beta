import { Alert } from 'react-native';

export function confirmStartLive(onConfirm: () => void) {
  Alert.alert(
    'Start live?',
    'Viewers will be able to watch as soon as you go live. Make sure your camera and mic are ready.',
    [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Start live', onPress: onConfirm },
    ],
  );
}

/** OBS / RTMP path — start the show without turning on the phone camera. */
export function confirmStartObsShow(onConfirm: () => void) {
  Alert.alert(
    'Start show with OBS?',
    'This opens the live room for buyers. Video comes from OBS — keep Start Streaming on in OBS. This will not turn on your phone camera.',
    [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Start show', onPress: onConfirm },
    ],
  );
}

export function confirmEndLive(onConfirm: () => void) {
  Alert.alert(
    'End live?',
    'This ends the show for all viewers. Are you sure you want to stop the stream?',
    [
      { text: 'Keep live', style: 'cancel' },
      { text: 'End live', style: 'destructive', onPress: onConfirm },
    ],
  );
}
