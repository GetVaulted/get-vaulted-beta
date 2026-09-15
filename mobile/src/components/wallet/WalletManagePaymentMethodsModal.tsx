import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteBuyerPaymentMethod,
  fetchBuyerPaymentMethods,
  setBuyerDefaultPaymentMethod,
  type BuyerPaymentMethodRow,
} from '../../api/buyerWalletRepository';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import { WalletPaymentSetupPanel } from './WalletPaymentSetupStep';
import { vaultWalletTheme as t } from './vaultWalletTheme';
import { formatCardExp } from './walletSheetUtils';
import { walletPmIcon, walletPmLabel, normalizePmType } from './walletPaymentMethodDisplay';

type Props = {
  visible: boolean;
  accessToken?: string;
  onClose: () => void;
  /** Fires after any add/remove/set-default so the caller can refresh its own summary. */
  onChanged?: () => void;
};

/**
 * Manage saved payment methods from Account settings — list, set default, remove, or add another.
 * Mirrors the same saved-card list + remove pattern already live in VaultWalletSheet's Payment step.
 */
export function WalletManagePaymentMethodsModal({ visible, accessToken, onClose, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, spacing.lg);
  const [rows, setRows] = useState<BuyerPaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBuyerPaymentMethods(accessToken);
      setRows(res.paymentMethods);
      if (res.message) setError(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payment methods.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const handleSetDefault = async (pm: BuyerPaymentMethodRow) => {
    if (!accessToken || pm.isDefault || busyId) return;
    setBusyId(pm.id);
    try {
      await setBuyerDefaultPaymentMethod(accessToken, pm.id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set default.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = (pm: BuyerPaymentMethodRow) => {
    Alert.alert('Remove payment method', `Remove ${walletPmLabel(pm)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!accessToken) return;
            setBusyId(pm.id);
            try {
              await deleteBuyerPaymentMethod(accessToken, pm.id);
              await load();
              onChanged?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not remove payment method.');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={t.backdrop}>
        <Pressable
          style={{ flex: 1 }}
          onPress={addOpen ? undefined : onClose}
          accessibilityLabel="Dismiss"
        />
        {addOpen ? (
          // Render the add-card flow inside this same Modal instead of opening a second, stacked
          // one — two React Native <Modal>s mounted at once is why tapping "+ Add payment method"
          // did nothing (the new modal never became interactive over the still-open list modal).
          // Same fix already used for the wallet bottom sheet — see WalletPaymentSetupPanel's doc
          // comment ("avoids stacked modals on iPad").
          <View style={[t.sheet, { paddingBottom: safeBottom, maxHeight: '85%', flex: 1, paddingHorizontal: 0, paddingTop: 0 }]}>
            <WalletPaymentSetupPanel
              active={addOpen}
              accessToken={accessToken}
              onClose={() => setAddOpen(false)}
              onSaved={() => {
                setAddOpen(false);
                void load();
                onChanged?.();
              }}
            />
          </View>
        ) : (
          <View style={[t.sheet, { paddingBottom: safeBottom, maxHeight: '85%' }]}>
            <View style={t.handle} />
            <View style={t.headerRow}>
              <View style={t.headerSpacer} />
              <LiveRoomText style={t.headerTitle}>Payment Methods</LiveRoomText>
              <Pressable onPress={onClose} hitSlop={12} style={t.headerSpacer}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.65)" />
              </Pressable>
            </View>

            {error ? <LiveRoomText style={t.errorText}>{error}</LiveRoomText> : null}

            <ScrollView contentContainerStyle={t.scrollContent} showsVerticalScrollIndicator={false}>
              {loading && rows.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                  <ActivityIndicator color={colors.gold} />
                </View>
              ) : rows.length === 0 ? (
                <LiveRoomText style={t.sectionSubWarn}>No saved payment method yet.</LiveRoomText>
              ) : (
                rows.map((pm) => {
                  const pmType = normalizePmType(pm.type);
                  const isBusy = busyId === pm.id;
                  return (
                    <View key={pm.id} style={[t.savedPmCard, pm.isDefault && t.savedPmCardSelected]}>
                      <Pressable
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                        onPress={() => void handleSetDefault(pm)}
                        disabled={isBusy}
                      >
                        <View style={t.pmIcon}>
                          <Ionicons name={walletPmIcon(pmType)} size={20} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <LiveRoomText style={t.detailTitle}>{walletPmLabel(pm)}</LiveRoomText>
                          {pmType === 'card' && pm.last4 ? (
                            <LiveRoomText style={t.detailBody}>
                              ···· {pm.last4} · Exp {formatCardExp(pm.expMonth, pm.expYear)}
                            </LiveRoomText>
                          ) : (
                            <LiveRoomText style={t.detailBody}>Saved for live &amp; checkout</LiveRoomText>
                          )}
                        </View>
                        {pm.isDefault ? (
                          <LiveRoomText style={[t.pmActionTxt, { color: '#93c5fd' }]}>Default</LiveRoomText>
                        ) : null}
                      </Pressable>
                      {isBusy ? (
                        <ActivityIndicator color="#fca5a5" size="small" style={{ paddingHorizontal: spacing.xs }} />
                      ) : (
                        <Pressable
                          onPress={() => handleRemove(pm)}
                          hitSlop={10}
                          style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${walletPmLabel(pm)}`}
                        >
                          <Ionicons name="trash-outline" size={18} color="#fca5a5" />
                        </Pressable>
                      )}
                    </View>
                  );
                })
              )}

              <Pressable style={t.linkBtn} onPress={() => setAddOpen(true)}>
                <LiveRoomText style={t.linkBtnText}>+ Add payment method</LiveRoomText>
              </Pressable>
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}
