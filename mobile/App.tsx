import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AuthProvider } from './src/auth/AuthContext';
import { loadHomeFeedCache } from './src/lib/homeFeedCache';
import {
  isInvalidRefreshTokenError,
  recoverFromStaleAuthSession,
} from './src/lib/recoverInvalidAuthSession';
import { RootNavigator } from './src/navigation/RootNavigator';

WebBrowser.maybeCompleteAuthSession();

export default function App() {
  useEffect(() => {
    void loadHomeFeedCache();
  }, []);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isInvalidRefreshTokenError(event.reason)) return;
      event.preventDefault?.();
      void recoverFromStaleAuthSession();
    };
    globalThis.addEventListener?.('unhandledrejection', onUnhandledRejection);
    return () => globalThis.removeEventListener?.('unhandledrejection', onUnhandledRejection);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050505',
  },
});
