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
      "Requires OBS Studio 30 or newer (WHIP support).",
      "In Seller HQ → OBS Studio, pick your show and click Connect OBS to create WebRTC credentials.",
      "Open OBS → Settings → Stream → Service: WHIP.",
      "Paste the WHIP server (https://global.whip.live-video.net) into Server and the bearer token into Bearer Token.",
      "Recommended Output (Advanced → Streaming): max 720p, CBR ≤ 2500 Kbps, Keyframe Interval 1 s, B-frames 0, x264 veryfast + Tune zerolatency. OBS will switch audio to Opus for WHIP — accept that.",
      "Add Get Vaulted browser-source widgets (bid, sold, tips) from the Widgets section — generate a widget token and copy URLs with ?token= included.",
    ],
  },
  {
    id: "going-live",
    title: "Going live guide",
    body: [
      "Schedule your show, then Connect OBS and paste WHIP Server + Bearer Token into OBS.",
      "Click Start Streaming in OBS. When Get Vaulted detects the OBS publisher, the show goes live automatically — you do not need to tap Play on the phone.",
      "Use the phone/host console as the command center (queue, pin lots, start auctions). Do not tap Use this camera unless you want to leave OBS.",
      "Confirm Stream health shows Live. Signed-in app buyers get sub-second WebRTC; guest / share-link viewers use the HLS mirror (~a few seconds).",
      "When finished, stop OBS first, then End show from Host console.",
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    body: [
      "OBS must be v30+ with Service set to WHIP (not Custom RTMPS).",
      "Connecting forever: confirm OBS shows “Streaming”, then Refresh status in Stream settings.",
      "Auth failed / disconnected: rotate bearer token, update OBS, and start streaming again (tokens expire ~12 hours).",
      "Stream disconnects immediately: drop below 720p and ≤ 2.5 Mbps, B-frames 0, keyframe 1s. Stage rejects oversize publishes.",
      "No video for buyers: verify the correct show is selected and you did not also tap Use this camera / phone Go Live.",
      "Items won’t pin / start auction: wait until Stream health is Live (show auto-starts from the OBS signal). If another show is already live on your account, end it first.",
      "Dropped frames: lower bitrate or resolution; prefer wired ethernet.",
      "Widgets blank: confirm roomId in the widget URL matches your live show.",
      "401 on widgets: rotate the widget token in OBS Studio and update every browser source URL.",
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    body: [
      "Do I need OBS? No — you can use phone Go Live. OBS is for desktop production + overlays.",
      "Why WebRTC not RTMPS? WHIP → Stage matches Whatnot-style auction latency for app buyers.",
      "Can guests still watch? Yes — we mirror Stage → HLS for share links (a few seconds of delay).",
      "Webcam + OBS? Use one path per show — either phone Go Live or OBS WHIP, not both.",
      "Token expired mid-show? Rotate bearer token, paste into OBS, Start Streaming again.",
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
