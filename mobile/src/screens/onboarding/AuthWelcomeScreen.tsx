import { useLayoutEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AuthWelcome'>;

/** Legacy route: auth entry now lives on `LaunchIntro` (seamless intro → sign-in). */
export function AuthWelcomeScreen({ navigation }: Props) {
  useLayoutEffect(() => {
    navigation.replace('LaunchIntro', { instantAuth: true });
  }, [navigation]);

  return null;
}
