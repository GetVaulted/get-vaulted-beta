import { useFocusEffect } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback } from 'react';

/** Prevent iOS/Android auto-lock while this screen is focused (e.g. live watch/host). */
export function useKeepScreenAwakeWhileFocused(tag: string) {
  useFocusEffect(
    useCallback(() => {
      void activateKeepAwakeAsync(tag);
      return () => {
        deactivateKeepAwake(tag);
      };
    }, [tag]),
  );
}
