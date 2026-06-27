import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBuyerShippingAddress,
  updateBuyerShippingAddress,
  type CreateShippingAddressInput,
} from '../../api/buyerWalletRepository';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import { useKeyboardInset } from './walletSheetKeyboard';
import { walletAddressSetupStyles as s } from './walletAddressSetupStyles';
import { AddressAutocompleteFields } from '../address/AddressAutocompleteFields';

type Props = {
  visible: boolean;
  accessToken?: string;
  editing?: boolean;
  addressId?: string;
  initialDraft?: CreateShippingAddressInput;
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY: CreateShippingAddressInput = {
  name: 'Shipping',
  fullName: '',
  line1: '',
  line2: null,
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  isDefault: true,
};

function AddressInput({
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
    <View style={s.field}>
      <LiveRoomText style={s.fieldLabel}>{label}</LiveRoomText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#A1A1AA"
        style={s.input}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </View>
  );
}

/** Full-screen add/edit shipping address — separate from wallet bottom sheet. */
export function WalletAddressSetupModal({
  visible,
  accessToken,
  editing = false,
  addressId,
  initialDraft,
  onClose,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [draft, setDraft] = useState<CreateShippingAddressInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const footerPad = Math.max(insets.bottom, spacing.lg) + keyboardInset;

  useEffect(() => {
    if (!visible) return;
    setDraft(initialDraft ?? EMPTY);
    setError(null);
    setBusy(false);
  }, [visible, initialDraft]);

  const save = async () => {
    if (!accessToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (editing && addressId?.trim()) {
        await updateBuyerShippingAddress(accessToken, addressId, draft);
      } else {
        await createBuyerShippingAddress(accessToken, draft);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save address.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <SafeAreaView style={s.panelShell} edges={['top', 'bottom']}>
          <View style={s.panel}>
            <KeyboardAvoidingView
              style={s.body}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
            >
              <View style={s.headerRow}>
                <Pressable onPress={onClose} hitSlop={12} style={s.headerSpacer}>
                  <Ionicons name="chevron-back" size={24} color="#18181B" />
                </Pressable>
                <LiveRoomText style={s.headerTitle}>{editing ? 'Edit Address' : 'Add Address'}</LiveRoomText>
                <View style={s.headerSpacer} />
              </View>
              <ScrollView
                style={s.scroll}
                contentContainerStyle={[s.scrollContent, { paddingBottom: footerPad + 72 }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
              >
                <LiveRoomText style={s.subtitle}>
                  Shipping addresses are used for live auction wins and vault deliveries. We verify addresses with the
                  carrier before saving so labels do not fail later.
                </LiveRoomText>
                {error ? <LiveRoomText style={s.errorText}>{error}</LiveRoomText> : null}
                <AddressInput label="Label" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="Shipping" />
                <AddressInput label="Full name" value={draft.fullName} onChange={(v) => setDraft((d) => ({ ...d, fullName: v }))} placeholder="Jane Collector" />
                <AddressAutocompleteFields
                  accessToken={accessToken}
                  values={{
                    line1: draft.line1,
                    line2: draft.line2 ?? '',
                    city: draft.city,
                    state: draft.state,
                    postalCode: draft.postalCode,
                    country: draft.country,
                  }}
                  onChange={(field, value) =>
                    setDraft((d) => ({
                      ...d,
                      [field]:
                        field === 'country' ? value.toUpperCase().slice(0, 2) : field === 'line2' ? value : value,
                    }))
                  }
                  inputStyle={s.input}
                  labelStyle={s.fieldLabel}
                />
                <View style={s.switchRow}>
                  <LiveRoomText style={s.switchLabel}>Set as default shipping address</LiveRoomText>
                  <Switch value={draft.isDefault !== false} onValueChange={(v) => setDraft((d) => ({ ...d, isDefault: v }))} trackColor={{ true: colors.gold }} />
                </View>
              </ScrollView>
              <View style={[s.footer, { paddingBottom: footerPad }]}>
                <Pressable style={[s.primaryBtn, busy && s.primaryBtnDisabled]} onPress={() => void save()} disabled={busy}>
                  {busy ? <ActivityIndicator color="#0A0A0A" /> : <LiveRoomText style={s.primaryBtnText}>Save address</LiveRoomText>}
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
