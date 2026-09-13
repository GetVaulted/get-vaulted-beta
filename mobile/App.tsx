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
import { RootNavigator } from './src/navigation/RootNavigator';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://d50499adf72e53b7ea655a0b5f52fb84@o4511672261214208.ingest.us.sentry.io/4512076212666368',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

WebBrowser.maybeCompleteAuthSession();
configureGlobalTextScaling();

export default Sentry.wrap(function App() {
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
              <View style={styles.root}>
                <RootNavigator />
              </View>
            </AuthProvider>
          </PlatformFeeProvider>
        </AppLayoutProvider>
      </SafeAreaProvider>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050505',
  },
});
