/** OBS Studio Seller Mode — copy and help content. */
export const OBS_STUDIO = {
  pageTitle: "OBS Studio",
  pageSubtitle:
    "Schedule a show, connect OBS over WebRTC (WHIP), copy stream settings, and add browser-source overlays — without leaving Get Vaulted.",
  upcomingShows: "Upcoming shows",
  quickSetup: "OBS quick setup",
  streamSettings: "Stream settings",
  helpCenter: "OBS help center",
  widgets: "OBS browser-source widgets",
  selectShow: "Select a show",
  noShows: "No scheduled or live shows yet.",
  scheduleShow: "Schedule a show",
  openShow: "Open show",
  startShow: "Start show",
  streamSettingsBtn: "Stream settings",
  connectObs: "Connect OBS",
  useRtmpsFallback: "No WHIP option in OBS? Use classic RTMPS",
  switchToRtmps: "Having trouble with WHIP? Switch to classic RTMPS",
  switchToWhip: "Switch back to WebRTC (WHIP)",
  refreshStatus: "Refresh status",
  copyServer: "Copy WHIP server",
  copyKey: "Copy bearer token",
  revealKey: "Reveal token",
  hideKey: "Hide token",
  rotateKey: "Rotate bearer token",
  setupStream: "Set up stream",
  channelLatency: "IVS channel latency (guest HLS mirror)",
  channelLatencyLow: "LOW (~3–5s for guests / share links)",
  channelLatencyNormal: "NORMAL (~10–30s guest mirror — stop OBS, Refresh, restart)",
  channelLatencyUnknown: "Unknown — tap Refresh status",
  whipPath: "Ingest",
  whipPathLabel: "WebRTC (WHIP) — sub-second for app buyers",
  keyMissingHint:
    "Bearer token was shown once when OBS was connected. Click Rotate bearer token to issue a new one, then paste it into OBS (Settings → Stream → WHIP → Bearer Token).",
  lastHeartbeat: "Last heartbeat",
  connectionState: "Connection state",
  streamHealth: "Stream health",
  readyStatus: "Ready status",
  detectObs: "OBS signal",
  widgetHint: "Add as Browser Source in OBS (width 800×600 recommended). Transparent background supported.",
  widgetToken: "Widget access token",
  rotateWidgetToken: "Rotate widget token",
  generateWidgetToken: "Generate widget token",
  widgetTokenHint: "Token is shown once after rotate. Copy widget URLs before leaving this page — OBS does not use your login session.",
  widgetTokenActive: "Widget token active",
  widgetTokenMissing: "Generate a token so OBS browser sources can load overlay data without signing in.",
} as const;

export type ObsHelpArticleId = "first-setup" | "going-live" | "troubleshooting" | "faq";

export const OBS_HELP_ARTICLES: {
  id: ObsHelpArticleId;
  title: string;
  body: string[];
}[] = [
  {
    id: "first-setup",
    title: "First-time OBS setup",
    body: [
      "Two ways to connect: WHIP (OBS Studio 30+, sub-second latency) or classic RTMPS (works on any OBS version and most other broadcast software). Connect OBS defaults to WHIP — only use RTMPS if your OBS Service list has no WHIP option.",
      "In Seller HQ → OBS Studio, pick your show, then click Connect OBS.",
      "WHIP: open OBS → Settings → Stream → Service: WHIP. Paste the WHIP server (https://global.whip.live-video.net) into Server and the bearer token into Bearer Token.",
      "No WHIP in your Service list? Click “No WHIP option in OBS? Use classic RTMPS” next to Connect OBS instead.",
      "RTMPS: open OBS → Settings → Stream → Service: Custom. Paste the RTMPS server URL into Server and the one-time stream key into Stream Key.",
      "WHIP output settings (Advanced → Streaming): max 720p, CBR ≤ 2500 Kbps, Keyframe Interval 1 s, B-frames 0, x264 veryfast + Tune zerolatency. OBS switches audio to Opus for WHIP — accept that.",
      "RTMPS output settings: up to 1080p30, H.264, roughly 3,500 Kbps at 720p or 6,000 Kbps at 1080p, Keyframe Interval 2 s.",
      "Add Get Vaulted browser-source widgets (bid, sold, tips) from the Widgets section — generate a widget token and copy URLs with ?token= included.",
    ],
  },
  {
    id: "going-live",
    title: "Going live guide",
    body: [
      "Schedule your show, then Connect OBS (or the RTMPS fallback) and paste the settings shown into OBS.",
      "Click Start Streaming in OBS. When Get Vaulted detects your signal, the show goes live automatically — you do not need to tap Play on the phone.",
      "Use the phone/host console as the command center (queue, pin lots, start auctions). Do not tap Use this camera unless you want to leave OBS.",
      "Confirm Stream health shows Live. WHIP gives signed-in app buyers sub-second video; RTMPS and the guest / share-link HLS mirror both run a few seconds behind.",
      "Already connected on one path and want to switch? Use the small switch-protocol link under Connect OBS on the Stream settings card — no need to start over.",
      "When finished, stop OBS first, then End show from Host console.",
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    body: [
      "OBS must be v30+ to see Service: WHIP. Running an older OBS, Streamlabs, or another encoder without a WHIP option? Click “No WHIP option in OBS? Use classic RTMPS” under Connect OBS — works on any encoder with a Custom RTMPS service.",
      "Connecting forever on WHIP: confirm OBS shows “Streaming”, then Refresh status in Stream settings. If it never clears, switch to RTMPS — some networks and firewalls block WebRTC (WHIP) traffic that plain RTMP gets through fine.",
      "Connecting forever on RTMPS: re-check that Server and Stream Key were pasted exactly as shown with no extra spaces, and that Service is set to Custom, not a named platform.",
      "Auth failed / disconnected on WHIP: rotate the bearer token, update OBS, and start streaming again (tokens are valid about 12 hours).",
      "Auth failed / disconnected on RTMPS: rotate the stream key — the old key stops working the moment you rotate.",
      "Stream disconnects immediately on WHIP: drop to 720p or lower, ≤ 2.5 Mbps, B-frames 0, keyframe 1 s. The real-time Stage rejects oversize publishes outright.",
      "Stream disconnects immediately on RTMPS: lower your bitrate — try 720p at ~3,500 Kbps first, then work up.",
      "No video for buyers: verify the correct show is selected and you did not also tap Use this camera / phone Go Live.",
      "Items won’t pin / start auction: wait until Stream health is Live (show auto-starts from your OBS signal). If another show is already live on your account, end it first.",
      "Dropped frames: lower bitrate or resolution; prefer wired ethernet over Wi-Fi.",
      "Widgets blank: confirm roomId in the widget URL matches your live show.",
      "401 on widgets: rotate the widget token in OBS Studio and update every browser source URL.",
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    body: [
      "Do I need OBS? No — you can use phone Go Live instead. OBS is for desktop production and overlays.",
      "WHIP or RTMPS — which should I use? WHIP if your OBS is version 30 or newer; it is lower latency for app buyers. RTMPS if you are on an older OBS or a different encoder — it works everywhere and buyers still see your stream, just a few seconds behind.",
      "Can guests still watch? Yes — we mirror your stream to HLS for share links either way (a few seconds of delay).",
      "Webcam + OBS? Use one path per show — either phone Go Live or OBS (WHIP or RTMPS), not both.",
      "Token or key expired mid-show? Rotate it from Stream settings, paste the new one into OBS, and Start Streaming again.",
    ],
  },
];

export const OBS_WIDGETS = [
  { id: "bid", label: "Bid overlay", description: "Current lot title, high bid, and leader." },
  { id: "sold", label: "Sold overlay", description: "Flash when a lot sells." },
  { id: "break", label: "Break overlay", description: "Break phase and spot summary." },
  { id: "viewers", label: "Viewer alerts", description: "Live viewer count with pulse on growth." },
  { id: "tips", label: "Tips alerts", description: "Recent tip messages from chat." },
] as const;

export type ObsWidgetKind = (typeof OBS_WIDGETS)[number]["id"];
