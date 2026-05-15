import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 15,
  duration: "45s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const res = http.get(`${BASE_URL}/api/time`, {
    headers: { "cache-control": "no-store" },
  });
  check(res, {
    "time 200": (r) => r.status === 200,
    "has serverNowMs": (r) => {
      try {
        const j = r.json();
        return typeof j?.serverNowMs === "number";
      } catch {
        return false;
      }
    },
  });
  sleep(0.3);
}
