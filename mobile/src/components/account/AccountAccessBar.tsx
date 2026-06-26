import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { confirmAndSignOut, performSignOut, signOutSessionOptions } from '../../lib/signOutSession';
import { openSettings } from '../../navigation/openPlatform';
import { colors, radii, spacing } from '../../theme';

type Props = {
  /** Footer bar pinned on Seller HQ; inline row on other surfaces. */
  variant?: 'inline' | 'footer';
  /** Hide Settings when Seller HQ already covers seller setup in-tab. */
  hideSettings?: boolean;
};

/**
 * Always-visible account actions for signed-in users (Settings + Sign out).
 * Independent of seller payout / HQ approval state.
 */
export function AccountAccessBar({ variant = 'inline', hideSettings = false }: Props) {
  const { user, session, signOut } = useAuth();
  if (!user) return null;

  const signOutOpts = signOutSessionOptions(user, session);

  const isFooter = variant === 'footer';

  return (
    <View style={[styles.shell, isFooter && styles.shellFooter]} accessibilityRole="toolbar" accessibilityLabel="Account">
      {!hideSettings ? (
        <>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={() => openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={18} color={colors.gold} />
            <Text style={styles.btnLabel}>Settings</Text>
          </Pressable>
          <View style={styles.divider} />
        </>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.btn, styles.btnSignOut, pressed && styles.btnPressed]}
        onPress={() =>
          isFooter ? confirmAndSignOut(signOut, signOutOpts) : void performSignOut(signOut, signOutOpts)
        }
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Ionicons name="log-out-outline" size={18} color={colors.live} />
        <Text style={[styles.btnLabel, styles.btnLabelSignOut]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  shellFooter: {
    marginTop: spacing.sm,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  btnSignOut: {
    backgroundColor: 'rgba(255,59,48,0.06)',
  },
  btnPressed: { opacity: 0.88 },
  btnLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  btnLabelSignOut: { color: colors.live },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
