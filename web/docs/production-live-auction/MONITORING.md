# Monitoring and alerts — live auction

## Golden signals (Prometheus / Azure Monitor style)

Record these as histograms or track in APM from OTel spans:

| Metric | Description | Suggested alert |
|--------|-------------|-----------------|
| `live_auction_bid_post_duration_ms` | Span `live_auction.bid.post` | p95 > SLO (see `ACCEPTANCE-SLA.md`) for 5m |
| `live_auction_fanout_flush_duration_ms` | Span `live_auction.fanout.flush` | p95 > 500ms sustained |
| `live_auction_drain_backlog` | `COUNT(*) WHERE published_at IS NULL` | > N rows for 5m |
| `live_auction_idempotency_replay_total` | Idempotency cache hits | anomaly drop = clients retrying wrong |
| `live_auction_bid_409_total` | `CONCURRENT_HIGHER_BID` rate | spike may be abuse or UX issue |
| `live_auction_sidecar_redis_fail_total` | Redis XADD failures | > 0 sustained if REDIS_URL set |
| `live_auction_sidecar_kafka_fail_total` | Kafka send failures | > 0 sustained if KAFKA_BROKERS set |

## Derived SLOs

- **Fan‑out lag:** `publishedAt - createdAt` per event (SQL or periodic job exporting gauge).
- **Partition lag (Kafka):** consumer group lag for `auction.events` by partition ≈ `liveRoomId` hash.

## Dashboard panels (minimum)

1. Bid POST rate + error % (4xx/5xx).
2. p50/p95/p99 bid span latency.
3. Drain backlog count + flush batch size.
4. Redis/Kafka sidecar error counters.
5. Top rooms by bid rate (dimension `live.room_id` on spans — **cardinality guard**: sample or top‑K only).

## Alert rules (YAML sketch)

```yaml
groups:
  - name: live-auction
    rules:
      - alert: LiveAuctionFanoutLagHigh
        expr: live_auction_drain_backlog > 500
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: Unpublished auction events backing up

      - alert: LiveAuctionBidPostP95High
        expr: histogram_quantile(0.95, rate(live_auction_bid_post_duration_ms_bucket[5m])) > 120
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: Bid acceptance latency elevated
```

Tune thresholds after baseline k6 + prod shadow traffic.
