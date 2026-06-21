import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  appFontSize,
  appLayoutDimensions,
  appUniformScale,
  isCompactAppLayout,
} from '../lib/appUiScale';

export type AppLayoutMetrics = {
  windowWidth: number;
  windowHeight: number;
  layoutWidth: number;
  layoutHeight: number;
  uiScale: number;
  compact: boolean;
  fontSize: (base: number) => number;
};

const AppLayoutContext = createContext<AppLayoutMetrics | null>(null);

function buildMetrics(windowWidth: number, windowHeight: number): AppLayoutMetrics {
  const uiScale = appUniformScale(windowWidth);
  const { layoutWidth, layoutHeight } = appLayoutDimensions(windowWidth, windowHeight, uiScale);
  return {
    windowWidth,
    windowHeight,
    layoutWidth,
    layoutHeight,
    uiScale,
    compact: isCompactAppLayout(windowWidth, windowHeight),
    fontSize: (base: number) => appFontSize(base, uiScale),
  };
}

export function useAppLayout(): AppLayoutMetrics {
  const ctx = useContext(AppLayoutContext);
  const { width, height } = useWindowDimensions();
  return ctx ?? buildMetrics(width, height);
}

export function AppLayoutProvider({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const metrics = useMemo(() => buildMetrics(width, height), [width, height]);

  if (metrics.uiScale >= 0.999) {
    return <AppLayoutContext.Provider value={metrics}>{children}</AppLayoutContext.Provider>;
  }

  return (
    <AppLayoutContext.Provider value={metrics}>
      <View style={styles.clip}>
        <View
          style={[
            styles.scaledStage,
            {
              width: metrics.layoutWidth,
              height: metrics.layoutHeight,
              transform: [{ scale: metrics.uiScale }],
            },
          ]}
        >
          <View style={styles.scaledContent}>{children}</View>
        </View>
      </View>
    </AppLayoutContext.Provider>
  );
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#050505',
  },
  scaledStage: {
    transformOrigin: 'top left',
  },
  scaledContent: {
    flex: 1,
  },
});
