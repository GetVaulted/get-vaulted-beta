import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchSellerAccount, patchSellerShipFrom } from '../../../api/sellerAccountRepository';
import { colors, radii, spacing } from '../../../theme';

export function SellerShipFromSetupCard({
  accessToken,
  onSaved,
}: {
  accessToken?: string;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('US');

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { seller } = await fetchSellerAccount(accessToken);
      setName(seller.shipFromName ?? '');
      setStreet(seller.shipFromStreet ?? '');
      setCity(seller.shipFromCity ?? '');
      setState(seller.shipFromState ?? '');
      setZip(seller.shipFromZip ?? '');
      setCountry(seller.shipFromCountry?.trim() || 'US');
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!accessToken) {
      Alert.alert('Sign in required', 'Sign in to save your shipping address.');
      return;
    }
    const fields = [street, city, state, zip, country].map((v) => v.trim());
    if (fields.some((v) => !v)) {
      Alert.alert('Complete your address', 'Street, city, state, ZIP, and country are required before you can go live.');
      return;
    }
    setBusy(true);
    try {
      await patchSellerShipFrom(accessToken, {
        shipFromName: name.trim() || undefined,
        shipFromStreet: street.trim(),
        shipFromCity: city.trim(),
        shipFromState: state.trim(),
        shipFromZip: zip.trim(),
        shipFromCountry: country.trim(),
      });
      Alert.alert('Shipping address saved', 'You can schedule and host live events once payouts are ready.');
      onSaved?.();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="cube-outline" size={20} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Ship-from address</Text>
          <Text style={styles.sub}>Required before hosting — used for Shippo labels on live orders.</Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.md }} />
      ) : (
        <View style={styles.form}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name on label (optional)"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            value={street}
            onChangeText={setStreet}
            placeholder="Street address"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <View style={styles.row}>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.flex]}
            />
            <TextInput
              value={state}
              onChangeText={setState}
              placeholder="State"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.state]}
            />
          </View>
          <View style={styles.row}>
            <TextInput
              value={zip}
              onChangeText={setZip}
              placeholder="ZIP"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={[styles.input, styles.flex]}
            />
            <TextInput
              value={country}
              onChangeText={setCountry}
              placeholder="Country"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              style={[styles.input, styles.state]}
            />
          </View>
          <Pressable style={[styles.save, busy && styles.saveOff]} onPress={() => void save()} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.saveTxt}>Save shipping address</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.06)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 2 },
  form: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  state: { width: 88 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  save: {
    marginTop: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  saveOff: { opacity: 0.6 },
  saveTxt: { fontSize: 14, fontWeight: '900', color: colors.background },
});
