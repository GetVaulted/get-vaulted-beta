-- Remotely editable home promo banner (referral campaigns, maintenance, drops).
CREATE TABLE IF NOT EXISTS "PlatformAppBanner" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "ctaLabel" TEXT NOT NULL DEFAULT '',
    "href" TEXT NOT NULL DEFAULT '',
    "dismissKey" TEXT NOT NULL DEFAULT 'default',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "PlatformAppBanner_pkey" PRIMARY KEY ("id")
);

-- Seed referral promo so ops can toggle it on without typing from scratch.
INSERT INTO "PlatformAppBanner" (
  "id", "enabled", "title", "body", "ctaLabel", "href", "dismissKey", "updatedAt"
) VALUES (
  'default',
  false,
  'Invite friends. Earn credit.',
  'Share your referral link — when friends join and buy, you earn store credit.',
  'Get my link',
  '/account/referrals',
  'referral-v1',
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
