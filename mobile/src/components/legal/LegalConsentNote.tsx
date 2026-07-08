import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { siteUrls } from '../../lib/siteUrls';
import { colors, spacing } from '../../theme';

export function LegalConsentNote() {
  const open = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.txt}>
        By signing in or creating an account, you agree to our{' '}
        <Text style={styles.link} onPress={() => open(siteUrls.terms())}>
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text style={styles.link} onPress={() => open(siteUrls.privacy())}>
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md, marginBottom: spacing.xs },
  txt: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  link: { color: colors.gold, fontWeight: '700' },
});
