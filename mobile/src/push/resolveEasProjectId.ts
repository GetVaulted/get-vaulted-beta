import Constants from 'expo-constants';

/** Resolve Expo EAS project id for push token registration (required on Android). */
export function resolveEasProjectId(): string | undefined {
  const fromEnv =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || process.env.EAS_PROJECT_ID?.trim();
  if (fromEnv) return fromEnv;

  const extra =
    Constants.expoConfig?.extra ??
    (Constants.manifest2 as { extra?: Record<string, unknown> } | null)?.extra;
  const fromExtra =
    extra && typeof extra === 'object' && 'eas' in extra
      ? (extra.eas as { projectId?: string } | undefined)?.projectId?.trim()
      : undefined;
  if (fromExtra) return fromExtra;

  return Constants.easConfig?.projectId?.trim() || undefined;
}
