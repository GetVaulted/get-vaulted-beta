import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  pickPhotoFromCamera,
  pickPhotosFromLibrary,
  promptPhotoPickSource,
} from './pickListingMedia';
import { relabelListingMedia } from './relabelListingMedia';
import type { ListingMediaItem, ListingPreview } from './types';
import { applyOptionalAiScanPatch, hasConfidentAiSuggestions } from './applyOptionalAiScan';
import { buildMockAiListingScan } from './mockAiListingScan';
import { listingAssistantReply } from './listingAssistantReplies';
import { sanitizeSubcategoriesForCategory } from './listingCategoryTaxonomy';
import type { ListingChannel } from './listingChannel';
import { normalizeCategoryId } from '../types';
import type { AiTrackedField, CreateListingFormState, ListingCommerceType } from './types';
import { countListingPhotos, emptyCreateListingForm, LISTING_MAX_PHOTOS, LIVE_INVENTORY_PHOTOS, normalizeAuctionDurationDays } from './types';

type SavedDraft = {
  id: string;
  name: string;
  savedAt: number;
  form: CreateListingFormState;
};

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const WELCOME_ASSISTANT: AssistantMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text:
      'I am your vault listing co-pilot. Ask for sharper copy, premium tone, pricing context, SEO tags, shipping cues, or live-ready language — suggestions are optional and you publish what you approve.',
  },
];

/** Supports drafts saved before multi-select subcategories. */
function normalizeSubcategories(form: Partial<CreateListingFormState & { subcategory?: string | null }>): string[] {
  if (Array.isArray(form.subcategories)) return form.subcategories;
  const legacy = (form as { subcategory?: string | null }).subcategory;
  if (typeof legacy === 'string' && legacy.trim()) return [legacy.trim()];
  return [];
}

function mergeLoadedDraft(form: Partial<CreateListingFormState>): CreateListingFormState {
  const e = emptyCreateListingForm();
  const category =
    form.category != null ? normalizeCategoryId(form.category) ?? e.category : e.category;
  return {
    ...e,
    ...form,
    category,
    listingChannel: form.listingChannel ?? e.listingChannel,
    media: form.media ?? e.media,
    subcategories:
      category != null
        ? sanitizeSubcategoriesForCategory(category, normalizeSubcategories(form))
        : normalizeSubcategories(form),
    aiFieldBadges: form.aiFieldBadges ?? e.aiFieldBadges,
    aiReviewReasons: form.aiReviewReasons ?? e.aiReviewReasons,
    auctionDurationDays: normalizeAuctionDurationDays(
      form as Partial<CreateListingFormState> & { auctionDurationHours?: string },
    ),
  };
}

type Ctx = {
  form: CreateListingFormState;
  setForm: (patch: Partial<CreateListingFormState>) => void;
  replaceForm: (next: CreateListingFormState) => void;
  userListings: ListingPreview[];
  drafts: SavedDraft[];
  editingDraftId: string | null;
  startFresh: () => void;
  beginListingChannel: (channel: ListingChannel) => void;
  loadDraft: (draftId: string) => void;
  saveDraft: (name?: string) => string;
  /** After Supabase publish succeeds — updates HQ inventory and clears the draft. */
  completeAfterPublish: (preview: ListingPreview) => void;
  removeMedia: (id: string) => void;
  reorderMedia: (fromIndex: number, toIndex: number) => void;
  setMediaOrder: (media: ListingMediaItem[]) => void;
  addMockPhoto: (kind?: 'photo' | 'video') => void;
  promptAddPhotos: () => void;
  runAiMediaScan: () => Promise<void>;
  confirmAiField: (field: AiTrackedField) => void;
  assistantMessages: AssistantMessage[];
  sendAssistantPrompt: (text: string) => void;
};

const CreateListingDraftContext = createContext<Ctx | null>(null);

function formToPrice(f: CreateListingFormState): string {
  switch (f.listingType) {
    case 'buy_now':
    case 'vault_drop':
      return f.buyNowPrice.trim() || 'Set price';
    case 'auction':
    case 'live_auction':
      return f.startingBid.trim() ? `From ${f.startingBid}` : 'Auction';
    case 'break_spot':
      return f.spotPrice.trim() ? `${f.spotPrice}/spot` : 'Break spots';
    case 'trade_only':
      return 'Trade offers';
    default:
      return '—';
  }
}

export function CreateListingDraftProvider({ children }: { children: ReactNode }) {
  const [form, setFormState] = useState<CreateListingFormState>(emptyCreateListingForm);
  const [userListings, setUserListings] = useState<ListingPreview[]>([]);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(WELCOME_ASSISTANT);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const formRef = useRef(form);
  formRef.current = form;

  const setForm = useCallback((patch: Partial<CreateListingFormState>) => {
    setFormState((s) => {
      const next: CreateListingFormState = { ...s, ...patch };
      if (patch.aiFieldBadges) {
        next.aiFieldBadges = { ...s.aiFieldBadges, ...patch.aiFieldBadges };
      }
      return next;
    });
  }, []);

  const replaceForm = useCallback((next: CreateListingFormState) => {
    setFormState(next);
  }, []);

  const startFresh = useCallback(() => {
    setFormState(emptyCreateListingForm());
    setEditingDraftId(null);
    setAssistantMessages(WELCOME_ASSISTANT);
  }, []);

  const beginListingChannel = useCallback((channel: ListingChannel) => {
    setFormState({
      ...emptyCreateListingForm(),
      listingChannel: channel,
      featureInLive: channel === 'live_show',
    });
    setEditingDraftId(null);
    setAssistantMessages(WELCOME_ASSISTANT);
  }, []);

  const loadDraft = useCallback((draftId: string) => {
    const d = draftsRef.current.find((x) => x.id === draftId);
    if (d) {
      setFormState(mergeLoadedDraft(d.form));
      setEditingDraftId(draftId);
      setAssistantMessages(WELCOME_ASSISTANT);
    }
  }, []);

  const saveDraft = useCallback(
    (name?: string) => {
      const id = editingDraftId ?? `draft-${Date.now()}`;
      const label = name?.trim() || form.title.trim() || 'Untitled draft';
      const entry: SavedDraft = {
        id,
        name: label,
        savedAt: Date.now(),
        form: { ...form },
      };
      setDrafts((prev) => {
        const rest = prev.filter((p) => p.id !== id);
        return [entry, ...rest];
      });
      setEditingDraftId(id);
      const channel = form.listingChannel ?? 'marketplace';
      const preview: ListingPreview = {
        id,
        title: label,
        imageUrl: form.media[0]?.uri ?? 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400',
        price: formToPrice(form),
        status: 'draft',
        watches: 0,
        live: channel === 'live_show',
        channel,
      };
      setUserListings((prev) => {
        const rest = prev.filter((p) => p.id !== id);
        return [preview, ...rest];
      });
      return id;
    },
    [editingDraftId, form],
  );

  const completeAfterPublish = useCallback(
    (preview: ListingPreview) => {
      setUserListings((prev) => [preview, ...prev.filter((p) => p.id !== editingDraftId && p.id !== preview.id)]);
      setDrafts((prev) => prev.filter((d) => d.id !== editingDraftId));
      setEditingDraftId(null);
      setFormState(emptyCreateListingForm());
      setAssistantMessages(WELCOME_ASSISTANT);
    },
    [editingDraftId],
  );

  const removeMedia = useCallback((id: string) => {
    setFormState((s) => ({ ...s, media: s.media.filter((m) => m.id !== id) }));
  }, []);

  const reorderMedia = useCallback((fromIndex: number, toIndex: number) => {
    setFormState((s) => {
      const next = [...s.media];
      const [it] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, it);
      return { ...s, media: relabelListingMedia(next) };
    });
  }, []);

  const setMediaOrder = useCallback((media: ListingMediaItem[]) => {
    setFormState((s) => ({ ...s, media: relabelListingMedia(media) }));
  }, []);

  const appendPhotoAssets = useCallback((assets: { uri: string }[]) => {
    if (!assets.length) return;
    setFormState((s) => {
      const channel = s.listingChannel ?? 'marketplace';
      const maxPhotos = channel === 'live_show' ? LIVE_INVENTORY_PHOTOS : LISTING_MAX_PHOTOS;
      const currentPhotos = countListingPhotos(s.media);
      if (channel === 'live_show' && currentPhotos >= LIVE_INVENTORY_PHOTOS) {
        Alert.alert('Thumbnail limit', 'Live show inventory supports exactly 1 thumbnail image.');
        return s;
      }
      const remaining = maxPhotos - currentPhotos;
      const toAdd = assets.slice(0, Math.max(0, remaining));
      if (assets.length > toAdd.length) {
        Alert.alert(
          'Photo limit',
          channel === 'live_show'
            ? 'Live show inventory supports exactly 1 thumbnail image.'
            : `Only ${toAdd.length} more photo${toAdd.length === 1 ? '' : 's'} were added (max ${LISTING_MAX_PHOTOS} per listing).`,
        );
      }
      let photoIndex = currentPhotos;
      const newItems = toAdd.map((asset, i) => {
        photoIndex += 1;
        return {
          id: `m-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          uri: asset.uri,
          kind: 'photo' as const,
          label: channel === 'live_show' ? 'Thumbnail' : photoIndex === 1 ? 'Hero photo' : `Photo ${photoIndex}`,
        };
      });
      return { ...s, media: relabelListingMedia([...s.media, ...newItems]) };
    });
  }, []);

  const addPhotosFromSource = useCallback(
    async (source: 'camera' | 'library') => {
      const channel = formRef.current.listingChannel ?? 'marketplace';
      const maxPhotos = channel === 'live_show' ? LIVE_INVENTORY_PHOTOS : LISTING_MAX_PHOTOS;
      const photoCount = countListingPhotos(formRef.current.media);
      const remaining = maxPhotos - photoCount;
      if (remaining <= 0) {
        Alert.alert(
          'Photo limit',
          channel === 'live_show'
            ? 'Live show inventory supports exactly 1 thumbnail image.'
            : `Listings support up to ${LISTING_MAX_PHOTOS} photos.`,
        );
        return;
      }

      if (source === 'camera') {
        const picked = await pickPhotoFromCamera();
        if (!picked || picked.canceled || !picked.assets[0]) return;
        appendPhotoAssets([picked.assets[0]]);
        return;
      }

      const pickLimit = channel === 'live_show' ? 1 : remaining;
      const picked = await pickPhotosFromLibrary(pickLimit);
      if (!picked || picked.canceled || !picked.assets?.length) return;
      const images = picked.assets.filter((a) => a.type !== 'video').map((a) => ({ uri: a.uri }));
      appendPhotoAssets(images);
    },
    [appendPhotoAssets],
  );

  const promptAddPhotos = useCallback(async () => {
    const channel = formRef.current.listingChannel ?? 'marketplace';
    const maxPhotos = channel === 'live_show' ? LIVE_INVENTORY_PHOTOS : LISTING_MAX_PHOTOS;
    const photoCount = countListingPhotos(formRef.current.media);
    if (photoCount >= maxPhotos) {
      Alert.alert(
        'Photo limit',
        channel === 'live_show'
          ? 'Live show inventory supports exactly 1 thumbnail image.'
          : `Listings support up to ${LISTING_MAX_PHOTOS} photos.`,
      );
      return;
    }
    const source = await promptPhotoPickSource(channel === 'live_show' ? 'Upload thumbnail' : undefined);
    if (!source) return;
    await addPhotosFromSource(source);
  }, [addPhotosFromSource]);

  const addMockPhoto = useCallback(async (kind: 'photo' | 'video' = 'photo') => {
    if (kind === 'photo') {
      await promptAddPhotos();
      return;
    }

    const channel = formRef.current.listingChannel ?? 'marketplace';
    if (channel === 'live_show') {
      Alert.alert('Not available', 'Live show inventory uses a single thumbnail image — video is not supported.');
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Allow photo library access to add listing media.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setFormState((s) => ({
      ...s,
      media: [
        ...s.media,
        {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          uri: asset.uri,
          kind: 'video',
          label: 'Video',
        },
      ],
    }));
  }, [promptAddPhotos]);

  const runAiMediaScan = useCallback(async () => {
    setFormState((s) => {
      const patch = buildMockAiListingScan(s);
      const hasSuggestions = hasConfidentAiSuggestions(patch);
      const needsReview = hasSuggestions && Boolean(patch.aiNeedsSellerConfirmation);
      const merged = applyOptionalAiScanPatch(s, patch);
      return {
        ...merged,
        aiScanCompleted: true,
        aiNeedsSellerConfirmation: needsReview,
        aiAcknowledgedReviews: needsReview ? false : true,
        sellerConfirmedShippingTier:
          hasSuggestions && patch.aiShippingWeightCategory ? false : merged.sellerConfirmedShippingTier,
      };
    });
  }, []);

  const confirmAiField = useCallback((field: AiTrackedField) => {
    setFormState((s) => ({
      ...s,
      aiFieldBadges: { ...s.aiFieldBadges, [field]: 'confirmed' },
    }));
  }, []);

  const sendAssistantPrompt = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const reply = listingAssistantReply(trimmed, formRef.current);
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now() + 1}`;
    setAssistantMessages((prev) => [...prev, { id: uid, role: 'user', text: trimmed }, { id: aid, role: 'assistant', text: reply.reply }]);
    if (reply.patch) {
      setFormState((s) => ({ ...s, ...reply.patch }));
    }
  }, []);

  const value = useMemo(
    () => ({
      form,
      setForm,
      replaceForm,
      userListings,
      drafts,
      editingDraftId,
      startFresh,
      beginListingChannel,
      loadDraft,
      saveDraft,
      completeAfterPublish,
      removeMedia,
      reorderMedia,
      setMediaOrder,
      addMockPhoto,
      promptAddPhotos,
      runAiMediaScan,
      confirmAiField,
      assistantMessages,
      sendAssistantPrompt,
    }),
    [
      form,
      setForm,
      replaceForm,
      userListings,
      drafts,
      editingDraftId,
      startFresh,
      beginListingChannel,
      loadDraft,
      saveDraft,
      completeAfterPublish,
      removeMedia,
      reorderMedia,
      setMediaOrder,
      addMockPhoto,
      promptAddPhotos,
      runAiMediaScan,
      confirmAiField,
      assistantMessages,
      sendAssistantPrompt,
    ],
  );

  return <CreateListingDraftContext.Provider value={value}>{children}</CreateListingDraftContext.Provider>;
}

export function useCreateListingDraft() {
  const v = useContext(CreateListingDraftContext);
  if (!v) throw new Error('useCreateListingDraft requires provider');
  return v;
}
