# AWS IVS — Live streaming QA checklist

Use this for **real OBS + real devices** validation before wider alpha. Record initials and date in **Tester** fields.

**Prep**

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| AWS env vars set (`AWS_REGION`, keys, optional `IVS_EVENTS_WEBHOOK_SECRET`, `IVS_OPS_LOG` for server logs in prod) | ☐ / ☐ | | |
| Supabase realtime configured for live room broadcasts | ☐ / ☐ | | |
| `NEXT_PUBLIC_LIVE_DEBUG=true` only on private QA builds (enables `[LIVE_DEBUG]` console + in-player diagnostics) | ☐ / ☐ | | |

---

## 1. OBS setup

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Install OBS Studio (current stable) | ☐ / ☐ | | |
| **Settings → Stream**: service **Custom**, server = **RTMPS URL** from host Stream setup card, stream key = **one-time key** (paste once; never log or screenshot full key in shared channels) | ☐ / ☐ | | |
| **Output**: encoder H.264, bitrate within IVS guidance for your resolution | ☐ / ☐ | | |
| **Video**: 1280×720 or 1920×1080, 30 fps (or lower if network constrained) | ☐ / ☐ | | |

---

## 2. Provisioning flow

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Host opens Stream setup → **Set up stream** succeeds | ☐ / ☐ | | |
| RTMPS server + masked key appear; **Reveal / Copy** work | ☐ / ☐ | | |
| Server logs (if `IVS_OPS_LOG` or non-prod): `ivs_provision_success` without secrets | ☐ / ☐ | | |

---

## 3. Stream key rotation

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| **Rotate stream key** shows warning that **OBS must use the new key**; old key stops working | ☐ / ☐ | | |
| After rotate, start stream in OBS with **new** key only | ☐ / ☐ | | |

---

## 4. Host go-live flow

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Host starts show from console / seller flow; room **status** goes live as designed | ☐ / ☐ | | |
| OBS **Start Streaming**; within ~5–15s, Stream setup **Playback status** moves toward **Live** (may show **Connecting** first) | ☐ / ☐ | | |
| **Refresh stream status** (with sync) updates host card | ☐ / ☐ | | |

---

## 5. Buyer playback flow

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Buyer opens same room `/live/{id}`; sees standby until IVS **live** | ☐ / ☐ | | |
| HLS plays in supported desktop browsers (Chrome / Edge / Firefox) | ☐ / ☐ | | |
| Safari / iOS: native HLS path if applicable | ☐ / ☐ | | |
| No stream key or ingest URL in buyer network tab JSON | ☐ / ☐ | | |

---

## 6. Mobile playback

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| iOS Safari: video or clear standby; safe-area chrome not obscuring critical controls | ☐ / ☐ | | |
| Android Chrome: same | ☐ / ☐ | | |
| Portrait + landscape sanity | ☐ / ☐ | | |

---

## 7. Reconnect & background

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Tab **background** 30–60s → **foreground**: player refetches; no duplicate audio (no runaway HLS instances) | ☐ / ☐ | | |
| Toggle **airplane mode** 5s off/on: player backs off and recovers or shows error after bounded retries | ☐ / ☐ | | |
| Supabase reconnect: room still updates; optional `NEXT_PUBLIC_LIVE_DEBUG` shows `playback_visibility_resume` / connection logs | ☐ / ☐ | | |

---

## 8. Stream offline handling

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Stop OBS stream: buyers move to standby / offline messaging; **room status** can stay live while **stream health** shows offline (by design) | ☐ / ☐ | | |
| `stream_status` realtime causes host card + buyer refetch without full page reload | ☐ / ☐ | | |

---

## 9. Autoplay & audio

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Muted autoplay works where browser allows | ☐ / ☐ | | |
| **Tap to play** / **Tap for sound** appears when blocked | ☐ / ☐ | | |

---

## 10. Latency (observational)

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Note glass-to-glass feel (LOW latency mode); compare host OBS preview vs buyer ~N seconds | ☐ / ☐ | | |

---

## 11. Stale-live & errors

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Room **live**, kill OBS unexpectedly: `streamHealth` aligns to offline/ended after sync/webhook/poll path | ☐ / ☐ | | |
| No automatic auction end from stream drop alone | ☐ / ☐ | | |
| Misconfigured AWS: host sees friendly error, no secrets in UI | ☐ / ☐ | | |

---

## 12. Event ingestion (optional)

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| `POST /api/aws/ivs/events` with secret updates health (or 503 if secret unset) | ☐ / ☐ | | |
| Server log `ivs_event_ingested` includes `roomId`, `updated`, `streamHealth`, `stateTokenLen` (no raw channel ARN or key) | ☐ / ☐ | | |

---

## 13. Multiple viewers

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| 2+ buyer tabs + 1 host: playback stable; chat/room not part of this IVS checklist | ☐ / ☐ | | |

---

## 14. Stream end cleanup

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| Host **End** show (app flow): UI matches product spec | ☐ / ☐ | | |
| OBS stopped + room ended: no leaked timers in devtools (best-effort) | ☐ / ☐ | | |

---

## 15. Manual smoke — dual window

| Step | Pass / Fail | Tester | Notes |
|------|---------------|--------|-------|
| **Window A**: host/seller logged in, Stream setup + OBS | ☐ / ☐ | | |
| **Window B** (incognito buyer): same `liveRoomId` URL | ☐ / ☐ | | |
| Note **T0** OBS start → **T1** buyer first video frame (rough delta) | ☐ / ☐ | | |
| Repeat stop/start 3×; no stuck “Live” video on black screen after stop | ☐ / ☐ | | |

---

## Sign-off

| | |
|--|--|
| **Build / commit tested** | ☐ |
| **Blocking issues** (list): | |
| **Ready for wider alpha?** | ☐ Yes ☐ No |
