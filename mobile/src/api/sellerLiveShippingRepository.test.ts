import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/fetchWebApiAuthed', () => ({ fetchWebApiAuthed: fetchMock }));

import {
  createAdditionalBundledShippingLabel,
  fetchSellerLiveShippingDashboard,
} from './sellerLiveShippingRepository';

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const baseSession = {
  sessionId: 's1',
  liveShowId: 'show',
  liveShowTitle: 'Helmet night',
  buyer: { id: 'b', username: 'pat' },
  bundled: true,
  orders: [],
};

describe('fetchSellerLiveShippingDashboard — extra labels', () => {
  beforeEach(() => fetchMock.mockReset());

  it('reads packages, the remaining count and the cap, ordered by package index', async () => {
    fetchMock.mockResolvedValue(
      json({
        sessions: [
          {
            ...baseSession,
            canBuyAdditionalLabel: true,
            additionalLabelsRemaining: 2,
            maxLabelCount: 3,
            packages: [
              { id: 'p2', packageIndex: 1, labelUrl: 'https://l/2', trackingNumber: 'T2' },
              { id: 'p1', packageIndex: 0, labelUrl: 'https://l/1', trackingNumber: 'T1', labelCostCents: 1200 },
              { packageIndex: 9 }, // no id → dropped
            ],
          },
        ],
      }),
    );
    const d = await fetchSellerLiveShippingDashboard('tok');
    const s = d.sessions[0]!;
    expect(s.packages.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(s.packages[0]).toMatchObject({ labelUrl: 'https://l/1', labelCostCents: 1200 });
    expect(s.canBuyAdditionalLabel).toBe(true);
    expect(s.additionalLabelsRemaining).toBe(2);
    expect(s.maxLabelCount).toBe(3);
  });

  it('treats an older server response (no extra-label fields) as "no extra labels"', async () => {
    fetchMock.mockResolvedValue(json({ sessions: [baseSession] }));
    const s = (await fetchSellerLiveShippingDashboard('tok')).sessions[0]!;
    expect(s.packages).toEqual([]);
    expect(s.canBuyAdditionalLabel).toBe(false);
    expect(s.additionalLabelsRemaining).toBe(0);
  });

  it('never offers an extra label when none are left, even if the flag is set', async () => {
    fetchMock.mockResolvedValue(
      json({ sessions: [{ ...baseSession, canBuyAdditionalLabel: true, additionalLabelsRemaining: 0, maxLabelCount: 2 }] }),
    );
    expect((await fetchSellerLiveShippingDashboard('tok')).sessions[0]!.canBuyAdditionalLabel).toBe(false);
  });
});

describe('createAdditionalBundledShippingLabel', () => {
  beforeEach(() => fetchMock.mockReset());
  const parcel = { weightOz: 80, lengthIn: 14, widthIn: 12, heightIn: 12 };

  it('posts the session, parcel and the seller’s chosen carrier + service', async () => {
    fetchMock.mockResolvedValue(
      json({ ok: true, labelUrl: 'https://l/new', trackingNumber: 'T', packageIndex: 1, packagesBought: 2, maxPackages: 3 }),
    );
    const r = await createAdditionalBundledShippingLabel('tok', 's1', {
      parcel,
      preferredRate: { objectId: 'r1', carrier: 'UPS', service: 'Ground' },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/account/live-shipping/additional-label');
    const sent = JSON.parse((fetchMock.mock.calls[0]![2] as RequestInit).body as string);
    expect(sent).toMatchObject({
      sessionId: 's1',
      parcel,
      labelFormat: 'thermal_4x6',
      preferredRate: { objectId: 'r1', carrier: 'UPS', service: 'Ground' },
    });
    expect(r).toMatchObject({ ok: true, labelUrl: 'https://l/new', packagesBought: 2, maxPackages: 3 });
  });

  it('returns the server error + code instead of throwing', async () => {
    fetchMock.mockResolvedValue(json({ error: 'nope', code: 'ALL_LABELS_BOUGHT' }, 409));
    expect(await createAdditionalBundledShippingLabel('tok', 's1', { parcel })).toEqual({
      ok: false,
      error: 'nope',
      code: 'ALL_LABELS_BOUGHT',
    });
  });
});
