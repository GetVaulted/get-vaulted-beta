import http from "k6/http";
import { check, sleep } from "k6";

/**
 * Light read mix: public room detail + time endpoint.
 * Set `BASE_URL`, optional `LIVE_ROOM_ID` (URL-encoded id).
 */
export const options = {
  vus: 20,
  duration: "60s",
  thresholds: {
    http_req_failed: ["rate<0.08"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const ROOM_ID = __ENV.LIVE_ROOM_ID || "";

export default function () {
  const t = http.get(`${BASE_URL}/api/time`, { headers: { "cache-control": "no-store" } });
  check(t, { "time ok": (r) => r.status === 200 });

  if (ROOM_ID) {
    const r = http.get(`${BASE_URL}/api/live-rooms/${encodeURIComponent(ROOM_ID)}`, {
      headers: { "cache-control": "no-store" },
    });
    check(r, { "room 200 or 404": (res) => res.status === 200 || res.status === 404 });
  }

  sleep(0.25);
}
