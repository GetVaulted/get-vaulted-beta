import { lazy, Suspense, type ComponentType } from 'react';
import { View } from 'react-native';
import { colors } from '../theme';

/** Lazy-load stack screens so cold start does not parse heavy seller/live modules. */
export function lazyScreen<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> } | Record<string, ComponentType<P>>>,
  pick: (module: Record<string, ComponentType<P>>) => ComponentType<P>,
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const mod = await loader();
    if ('default' in mod && mod.default) {
      return { default: mod.default as ComponentType<P> };
    }
    return { default: pick(mod as Record<string, ComponentType<P>>) };
  });

  return function LazyScreen(props: P) {
    return (
      <Suspense
        fallback={<View style={{ flex: 1, backgroundColor: colors.background }} />}
      >
        <Lazy {...props} />
      </Suspense>
    );
  };
}
