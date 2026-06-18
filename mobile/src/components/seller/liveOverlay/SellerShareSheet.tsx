import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildSellerLiveShareOgDescription,
  buildSellerLiveShareOgTitle,
} from '../../../lib/liveRoomShare';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii, spacing } from '../../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  publicUrl: string;
  showTitle: string;
  hostUsername?: string;
  onToast?: (message: string) => void;
};

function socialShareUrl(platform: 'x' | 'facebook' | 'sms', url: string, title: string, description: string): string {
  const text = encodeURIComponent(`${title}\n${description}`);
  const link = encodeURIComponent(url);
  if (platform === 'x') return `https://twitter.com/intent/tweet?text=${text}&url=${link}`;
  if (platform === 'facebook') return `https://www.facebook.com/sharer/sharer.php?u=${link}`;
  return Platform.OS === 'ios' ? `sms:&body=${text}%20${link}` : `sms:?body=${text}%20${link}`;
}

export function SellerShareSheet({ visible, onClose, publicUrl, showTitle, hostUsername, onToast }: Props) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) setCopied(false);
  }, [visible]);

  const toast = (msg: string) => onToast?.(msg);

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(publicUrl);
      setCopied(true);
      toast('Link copied.');
    } catch {
      toast('Could not copy link.');
    }
  };

  const shareTitle = buildSellerLiveShareOgTitle(hostUsername ?? 'host');
  const shareDescription = buildSellerLiveShareOgDescription(showTitle);

  const nativeShare = async () => {
    try {
      await Share.share({
        title: shareTitle,
        message: `${shareTitle}\n${shareDescription}\n${publicUrl}`,
        url: Platform.OS === 'ios' ? publicUrl : undefined,
      });
      onClose();
    } catch {
      /* dismissed */
    }
  };

  const openSocial = async (platform: 'x' | 'facebook' | 'sms') => {
    const url = socialShareUrl(platform, publicUrl, shareTitle, shareDescription);
    try {
      await Linking.openURL(url);
    } catch {
      toast('Could not open share.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss share sheet" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{SELLER_CONSOLE.shareShow}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {showTitle}
          </Text>

          <Pressable style={styles.primaryBtn} onPress={() => void copyLink()}>
            <Text style={styles.primaryBtnTxt}>{SELLER_CONSOLE.copyLink}</Text>
            <Text style={styles.linkHint} numberOfLines={1}>
              {copied ? 'Copied' : publicUrl.replace(/^https?:\/\//, '')}
            </Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={() => void nativeShare()}>
            <Text style={styles.secondaryBtnTxt}>{SELLER_CONSOLE.nativeShare}</Text>
          </Pressable>

          <View style={styles.socialRow}>
            {(
              [
                ['X', 'x'],
                ['Facebook', 'facebook'],
                ['SMS', 'sms'],
              ] as const
            ).map(([label, platform]) => (
              <Pressable
                key={platform}
                style={styles.socialBtn}
                onPress={() => void openSocial(platform)}
              >
                <Text style={styles.socialBtnTxt}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.disabledBtn} disabled accessibilityState={{ disabled: true }}>
            <Text style={styles.disabledBtnTxt}>{SELLER_CONSOLE.inviteFollowers}</Text>
            <Text style={styles.soon}>Soon</Text>
          </Pressable>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
            <Text style={styles.closeBtnTxt}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: '#0a0a0a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  subtitle: { marginTop: 4, fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  primaryBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  primaryBtnTxt: { fontSize: 14, fontWeight: '800', color: colors.gold },
  linkHint: { marginTop: 4, fontSize: 11, fontWeight: '600', color: colors.textMuted },
  secondaryBtn: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  secondaryBtnTxt: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  socialRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  socialBtn: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(24,24,27,0.9)',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  socialBtnTxt: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.88)',
  },
  disabledBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
    opacity: 0.65,
  },
  disabledBtnTxt: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  soon: {
    marginLeft: spacing.sm,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: spacing.sm,
  },
  closeBtnTxt: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
});
