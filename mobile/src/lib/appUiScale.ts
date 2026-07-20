import { Text, TextInput, type TextInputProps, type TextProps } from 'react-native';

/** Pro Max-class portrait width where the app UI was originally tuned. */
export const APP_REF_WIDTH = 430;

export const APP_TEXT_PROPS = {
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
} as const;

/** Uniform scale for viewports narrower than the design baseline (e.g. iPhone 15 @ 393pt). */
export function appUniformScale(windowWidth: number): number {
  const width = Math.max(1, windowWidth);
  if (width >= APP_REF_WIDTH) return 1;
  return Math.max(0.84, width / APP_REF_WIDTH);
}

export function appLayoutDimensions(
  windowWidth: number,
  windowHeight: number,
  uiScale = appUniformScale(windowWidth),
): { layoutWidth: number; layoutHeight: number } {
  const scale = Math.max(0.01, uiScale);
  return {
    layoutWidth: windowWidth / scale,
    layoutHeight: windowHeight / scale,
  };
}

export function isCompactAppLayout(windowWidth: number, windowHeight: number): boolean {
  return windowWidth < 410 || windowHeight < 860;
}

export function appFontSize(base: number, uiScale: number): number {
  return Math.max(1, Math.round(base * uiScale));
}

/** Prevent iOS Dynamic Type from blowing up layouts outside live/marketplace wrappers. */
export function configureGlobalTextScaling(): void {
  const textDefaults = (Text as unknown as { defaultProps?: Partial<TextProps> }).defaultProps ?? {};
  textDefaults.allowFontScaling = APP_TEXT_PROPS.allowFontScaling;
  textDefaults.maxFontSizeMultiplier = APP_TEXT_PROPS.maxFontSizeMultiplier;
  (Text as unknown as { defaultProps?: Partial<TextProps> }).defaultProps = textDefaults;

  const inputDefaults = (TextInput as unknown as { defaultProps?: Partial<TextInputProps> }).defaultProps ?? {};
  inputDefaults.allowFontScaling = APP_TEXT_PROPS.allowFontScaling;
  inputDefaults.maxFontSizeMultiplier = APP_TEXT_PROPS.maxFontSizeMultiplier;
  // Turn on the native keyboard's autocorrect, spellcheck, and sentence capitalization for every
  // free-text field app-wide (chat, DMs, listing descriptions, reviews, etc.). Fields that must NOT
  // autocorrect — email, password, username/handle — set `autoCorrect={false}` / `autoCapitalize="none"`
  // on the instance, which overrides these defaults. Numeric fields use a number pad, so the keyboard
  // never offers corrections there.
  inputDefaults.autoCorrect = inputDefaults.autoCorrect ?? true;
  inputDefaults.spellCheck = inputDefaults.spellCheck ?? true;
  inputDefaults.autoCapitalize = inputDefaults.autoCapitalize ?? 'sentences';
  (TextInput as unknown as { defaultProps?: Partial<TextInputProps> }).defaultProps = inputDefaults;
}
