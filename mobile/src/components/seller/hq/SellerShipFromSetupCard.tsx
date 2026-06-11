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
import {
  formatSellerShipFromSummary,
  hasCompleteSellerShipFrom,
} from '../../../lib/seller-shipping-readiness';
import { colors, radii, spacing } from '../../../theme';

export function SellerShipFromSetupCard({
  accessToken,
  embedded = false,
  forceEditKey = 0,
  onSaved,
}: {
  accessToken?: string;
  /** Renders inside Seller essentials panel without outer card chrome. */
  embedded?: boolean;
  /** Increment to open the editor (e.g. from Vault Events readiness). */
  forceEditKey?: number;
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
  const [editing, setEditing] = useState(false);

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
      setEditing(!hasCompleteSellerShipFrom(seller));
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (forceEditKey > 0) setEditing(true);
  }, [forceEditKey]);

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
      const res = await patchSellerShipFrom(accessToken, {
        shipFromName: name.trim() || undefined,
        shipFromStreet: street.trim(),
        shipFromCity: city.trim(),
        shipFromState: state.trim(),
        shipFromZip: zip.trim(),
        shipFromCountry: country.trim(),
      });
      setEditing(false);
      onSaved?.();
      if (!res.readiness?.checks?.hasShipFromAddress) {
        Alert.alert('Shipping address saved', 'You can schedule and host live events once payouts are ready.');
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  const savedSummary = formatSellerShipFromSummary({
    shipFromStreet: street,
    shipFromCity: city,
    shipFromState: state,
    shipFromZip: zip,
    shipFromCountry: country,
  });
  const addressComplete = hasCompleteSellerShipFrom({
    shipFromStreet: street,
    shipFromCity: city,
    shipFromState: state,
    shipFromZip: zip,
    shipFromCountry: country,
  });
  const showSaved = !editing && addressComplete;

  const content = loading ? (
    <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.sm }} />
  ) : showSaved ? (
    <View style={styles.savedBlock}>
      <View style={styles.savedTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.savedTitle}>Ship-from address</Text>
          <Text style={styles.savedSummary}>{savedSummary}</Text>
        </View>
        <Pressable style={styles.editBtn} onPress={() => setEditing(true)} hitSlop={8}>
          <Text style={styles.editBtnTxt}>Edit</Text>
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={styles.form}>
      <Text style={styles.formTitle}>{addressComplete ? 'Update ship-from address' : 'Ship-from address'}</Text>
      <Text style={styles.formSub}>Used for Shippo labels on marketplace and live orders.</Text>
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
      <View style={styles.formActions}>
        {addressComplete ? (
          <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)} disabled={busy}>
            <Text style={styles.cancelBtnTxt}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable style={[styles.save, busy && styles.saveOff, addressComplete && styles.saveInline]} onPress={() => void save()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.saveTxt}>Save address</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  if (embedded) {
    return (
      <View style={styles.embeddedRow}>
        <View style={styles.rowIcon}>
          <Ionicons name="location-outline" size={20} color={colors.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>{content}</View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="cube-outline" size={20} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Ship-from address</Text>
          <Text style={styles.sub}>Required before hosting — used for Shippo labels on live orders.</Text>
        </View>
      </View>
      {content}
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
  embeddedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
    marginTop: 2,
  },
  form: { gap: spacing.sm },
  formTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  formSub: { fontSize: 12, lineHeight: 17, color: colors.textMuted, marginBottom: 2 },
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
  formActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  save: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  saveInline: { flex: 1 },
  saveOff: { opacity: 0.6 },
  saveTxt: { fontSize: 14, fontWeight: '900', color: colors.background },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelBtnTxt: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  savedBlock: { gap: spacing.xs },
  savedTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  savedTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  savedSummary: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 4 },
  editBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  editBtnTxt: { fontSize: 12, fontWeight: '800', color: colors.gold },
});
