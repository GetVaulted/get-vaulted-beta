import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  retrieveAutocompleteAddress,
  searchAddressAutocomplete,
  type AddressAutocompleteSuggestion,
  type AddressAutocompleteValues,
} from '../../api/addressAutocompleteRepository';
import { LiveRoomText } from '../live/LiveRoomText';
import { colors, radii, spacing } from '../../theme';

export type { AddressAutocompleteValues };

type FieldKey = keyof AddressAutocompleteValues;

type Props = {
  accessToken?: string;
  values: AddressAutocompleteValues;
  onChange: (field: FieldKey, value: string) => void;
  onResolved?: (values: AddressAutocompleteValues) => void;
  disabled?: boolean;
  line1Label?: string;
  inputStyle?: object;
  labelStyle?: object;
  showCountry?: boolean;
  countryReadOnly?: boolean;
  showLine2?: boolean;
};

function FieldLabel({
  label,
  labelStyle,
  children,
}: {
  label: string;
  labelStyle?: object;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 4 }}>
      <LiveRoomText style={[styles.label, labelStyle]}>{label}</LiveRoomText>
      {children}
    </View>
  );
}

export function AddressAutocompleteFields({
  accessToken,
  values,
  onChange,
  onResolved,
  disabled = false,
  line1Label = 'Address line 1',
  inputStyle,
  labelStyle,
  showCountry = true,
  countryReadOnly = false,
  showLine2 = true,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressAutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const containerRef = useRef<string | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = values.line1.trim();
    if (q.length < 3 || !accessToken) {
      setSuggestions([]);
      setOpen(false);
      setHint(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const res = await searchAddressAutocomplete(accessToken, q, values.country, containerRef.current);
          setSuggestions(res.suggestions);
          setOpen(res.suggestions.length > 0);
          setHint(res.enabled ? null : res.message ?? null);
        } catch {
          setSuggestions([]);
          setOpen(false);
        } finally {
          setBusy(false);
        }
      })();
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [accessToken, values.line1, values.country]);

  const applyResolved = (resolved: AddressAutocompleteValues) => {
    onChange('line1', resolved.line1);
    onChange('line2', resolved.line2);
    onChange('city', resolved.city);
    onChange('state', resolved.state);
    onChange('postalCode', resolved.postalCode);
    onChange('country', resolved.country);
    onResolved?.(resolved);
    containerRef.current = undefined;
    setOpen(false);
    setSuggestions([]);
  };

  const pickSuggestion = async (suggestion: AddressAutocompleteSuggestion) => {
    if (!accessToken) return;
    if (suggestion.isContainer) {
      containerRef.current = suggestion.id;
      const res = await searchAddressAutocomplete(accessToken, values.line1.trim(), values.country, suggestion.id);
      setSuggestions(res.suggestions);
      setOpen(res.suggestions.length > 0);
      return;
    }

    setBusy(true);
    try {
      const resolved = await retrieveAutocompleteAddress(accessToken, suggestion.id);
      applyResolved(resolved);
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Could not load that address.');
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, inputStyle];

  return (
    <View style={{ gap: spacing.sm }}>
      <FieldLabel label={line1Label} labelStyle={labelStyle}>
        <TextInput
          value={values.line1}
          editable={!disabled}
          onChangeText={(text) => {
            containerRef.current = undefined;
            onChange('line1', text);
          }}
          onFocus={() => {
            if (suggestions.length) setOpen(true);
          }}
          placeholder="Start typing your street address"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={input}
          autoCapitalize="words"
        />
        {busy ? <ActivityIndicator color={colors.gold} size="small" style={{ marginTop: 4 }} /> : null}
        {hint ? <LiveRoomText style={styles.hint}>{hint}</LiveRoomText> : null}
        {open && suggestions.length ? (
          <View style={styles.suggestList}>
            {suggestions.map((s) => (
              <Pressable key={s.id} style={styles.suggestRow} onPress={() => void pickSuggestion(s)}>
                <LiveRoomText style={styles.suggestTxt}>{s.label}</LiveRoomText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </FieldLabel>

      {showLine2 ? (
        <FieldLabel label="Address line 2 (optional)" labelStyle={labelStyle}>
          <TextInput
            value={values.line2}
            editable={!disabled}
            onChangeText={(text) => onChange('line2', text)}
            placeholder="Apt, suite, unit"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={input}
            autoCapitalize="words"
          />
        </FieldLabel>
      ) : null}

      <FieldLabel label="City" labelStyle={labelStyle}>
        <TextInput
          value={values.city}
          editable={!disabled}
          onChangeText={(text) => onChange('city', text)}
          placeholder="City"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={input}
          autoCapitalize="words"
        />
      </FieldLabel>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <FieldLabel label="State / region" labelStyle={labelStyle}>
            <TextInput
              value={values.state}
              editable={!disabled}
              onChangeText={(text) => onChange('state', text)}
              placeholder="CA"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={input}
              autoCapitalize="characters"
            />
          </FieldLabel>
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel label="Postal code" labelStyle={labelStyle}>
            <TextInput
              value={values.postalCode}
              editable={!disabled}
              onChangeText={(text) => onChange('postalCode', text)}
              placeholder="90210"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={input}
              keyboardType="number-pad"
            />
          </FieldLabel>
        </View>
      </View>

      {showCountry ? (
        <FieldLabel label="Country (ISO)" labelStyle={labelStyle}>
          <TextInput
            value={values.country}
            editable={!disabled && !countryReadOnly}
            onChangeText={(text) => onChange('country', text.toUpperCase().slice(0, 2))}
            placeholder="US"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={input}
            autoCapitalize="characters"
            maxLength={2}
          />
        </FieldLabel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  hint: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textMuted,
  },
  suggestList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#101014',
  },
  suggestRow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  suggestTxt: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
