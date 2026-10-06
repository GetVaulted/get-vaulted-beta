import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

/** Small gold tag for listings whose seller allows layaway. Sits over a photo corner. */
export function LayawayPill({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.pill, small && styles.pillSmall]} accessibilityLabel="Layaway available">
      <Text style={[styles.text, small && styles.textSmall]} allowFontScaling={false} numberOfLines={1}>
        Layaway
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 5,
    left: 5,
    height: 15,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: colors.gold,
    justifyContent: 'center',
  },
  pillSmall: { top: 4, left: 4, height: 14, paddingHorizontal: 5, borderRadius: 7 },
  text: {
    color: '#050505',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  textSmall: { fontSize: 7.5 },
});
