-- Align platform fee config with the 6.75% ceiling cutover.
-- Only rewrite rows still on the legacy seed (8 / 7.25 / 6.5 @ $1k/$3k) so intentional
-- admin edits that already match (or are lower) are left alone.

UPDATE "PlatformMarketplaceFeeConfig"
SET "platformFeePercent" = 6.75
WHERE id = 'default'
  AND "platformFeePercent" = 8;

UPDATE "PlatformLiveShowFeeConfig"
SET
  "tier1FeePercent" = 6.75,
  "tier2ThresholdUsd" = 3000,
  "tier2FeePercent" = 5.75,
  "tier3ThresholdUsd" = 5500,
  "tier3FeePercent" = 5
WHERE id = 'default'
  AND "tier1FeePercent" = 8
  AND "tier2FeePercent" = 7.25
  AND "tier3FeePercent" = 6.5
  AND "tier2ThresholdUsd" = 1000
  AND "tier3ThresholdUsd" = 3000;
