import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { PlatformFeeProvider } from './src/platform/PlatformFeeContext';
import { prefetchStripePublishableKey } from './src/components/live/LiveStripeProvider';
import { loadHomeFeedCache } from './src/lib/homeFeedCache';
import { configureGlobalTextScaling } from './src/lib/appUiScale';
import {
  isInvalidRefreshTokenError,
  recoverFromStaleAuthSession,
} from './src/lib/recoverInvalidAuthSession';
import { AppLayoutProvider } from './src/layout/AppLayoutProvider';
import { LiveMiniPlayerProvider } from './src/live/LiveMiniPlayerContext';
import { LiveMiniPlayerOverlay } from './src/live/LiveMiniPlayerOverlay';
import { RootNavigator } from './src/navigation/RootNavigator';

WebBrowser.maybeCompleteAuthSession();
configureGlobalTextScaling();

export default function App() {
  useEffect(() => {
    void loadHomeFeedCache();
    prefetchStripePublishableKey();
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
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AppLayoutProvider>
          <PlatformFeeProvider>
            <AuthProvider>
              <LiveMiniPlayerProvider>
                <View style={styles.root}>
                  <RootNavigator />
                  {/* Outside native-stack so the float is not buried under screen hosts. */}
                  <LiveMiniPlayerOverlay />
                </View>
              </LiveMiniPlayerProvider>
            </AuthProvider>
          </PlatformFeeProvider>
        </AppLayoutProvider>
      </SafeAreaProvider>
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
