import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { createBuyerShippingAddress } from '../../api/buyerWalletRepository';
import { colors, radii, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';

type Props = {
  accessToken?: string;
  onBack: () => void;
  onSaved: () => void;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize = 'words',
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <LiveRoomText style={styles.fieldLabel}>{label}</LiveRoomText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.input}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export function AddShippingAddressForm({ accessToken, onBack, onSaved }: Props) {
  const [name, setName] = useState('Shipping');
  const [fullName, setFullName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');
  const [isDefault, setIsDefault] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName('Shipping');
    setFullName('');
    setLine1('');
    setLine2('');
    setCity('');
    setState('');
    setPostalCode('');
    setCountry('US');
    setIsDefault(true);
    setError(null);
  }, []);

  const submit = async () => {
    if (!accessToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createBuyerShippingAddress(accessToken, {
        name,
        fullName,
        line1,
        line2: line2.trim() ? line2 : null,
        city,
        state,
        postalCode,
        country,
        isDefault,
      });
      resetForm();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save address.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12} disabled={busy}>
          <Ionicons name="chevron-back" size={22} color={colors.gold} />
        </Pressable>
        <LiveRoomText style={styles.title}>Add shipping address</LiveRoomText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {error ? <LiveRoomText style={styles.error}>{error}</LiveRoomText> : null}
        <Field label="Label" value={name} onChange={setName} placeholder="Shipping" />
        <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Jane Collector" />
        <Field label="Address line 1" value={line1} onChange={setLine1} placeholder="123 Main St" />
        <Field label="Address line 2 (optional)" value={line2} onChange={setLine2} placeholder="Apt 4" />
        <Field label="City" value={city} onChange={setCity} placeholder="City" />
        <Field label="State / region" value={state} onChange={setState} placeholder="CA" />
        <Field
          label="Postal code"
          value={postalCode}
          onChange={setPostalCode}
          placeholder="90210"
          keyboardType="number-pad"
        />
        <Field
          label="Country (ISO)"
          value={country}
          onChange={(v) => setCountry(v.toUpperCase().slice(0, 2))}
          placeholder="US"
          autoCapitalize="characters"
        />
        <View style={styles.switchRow}>
          <LiveRoomText style={styles.switchLabel}>Set as default shipping address</LiveRoomText>
          <Switch value={isDefault} onValueChange={setIsDefault} trackColor={{ true: colors.gold }} />
        </View>
      </ScrollView>

      <Pressable
        style={[styles.saveBtn, busy && styles.saveBtnBusy]}
        onPress={() => void submit()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <LiveRoomText style={styles.saveBtnText}>Save address</LiveRoomText>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerSpacer: { width: 22 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
  },
  scroll: { gap: spacing.sm, paddingBottom: spacing.md },
  field: { gap: 4 },
  fieldLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700' },
  input: {
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: '#fff',
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  switchLabel: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  error: { color: '#fca5a5', fontSize: 12, fontWeight: '600' },
  saveBtn: {
    marginTop: spacing.sm,
    minHeight: 46,
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnBusy: { opacity: 0.85 },
  saveBtnText: { color: '#0a0a0a', fontSize: 14, fontWeight: '900' },
});
