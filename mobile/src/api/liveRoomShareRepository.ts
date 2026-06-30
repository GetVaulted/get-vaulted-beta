import { fetchWebApiMobileWithSellerAuth } from '../lib/resolveSellerAccessToken';

export type ShareLiveRoomInAppResult = {
  sent: number;
  skipped: number;
};

export async function shareLiveRoomInApp(
  accessToken: string,
  liveRoomId: string,
  params: {
    recipientUserIds?: string[];
    notifyFollowers?: boolean;
    note?: string;
  },
): Promise<ShareLiveRoomInAppResult> {
  const res = await fetchWebApiMobileWithSellerAuth(
    `/api/live-rooms/${encodeURIComponent(liveRoomId)}/share-in-app`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
  );
  let body: ShareLiveRoomInAppResult & { error?: string } = { sent: 0, skipped: 0 };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Could not share in app.');
  }
  return { sent: body.sent ?? 0, skipped: body.skipped ?? 0 };
}
