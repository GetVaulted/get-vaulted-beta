import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { vaultFonts } from '../../theme/vaultTypography';

/** "Vault Seller" / "Verified" labels under a person's name in Messages. */
export function MessagePersonBadges({
  sellerLevelLabel,
  verified,
}: {
  sellerLevelLabel?: string | null;
  verified?: boolean;
}) {
  if (!sellerLevelLabel && !verified) return null;
  return (
    <View style={styles.row}>
      {sellerLevelLabel ? <Text style={[styles.txt, styles.seller]}>{sellerLevelLabel}</Text> : null}
      {verified ? <Text style={[styles.txt, styles.verified]}>Verified</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txt: {
    fontFamily: vaultFonts.label,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  seller: { color: colors.gold },
  verified: { color: '#8FCBFF' },
});
