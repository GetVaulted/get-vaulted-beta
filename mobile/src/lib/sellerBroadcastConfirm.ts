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
