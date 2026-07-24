/** OBS Studio Seller Mode — copy and help content. */
export const OBS_STUDIO = {
  pageTitle: "OBS Studio",
  pageSubtitle: "Schedule a show, connect OBS, copy stream settings, and add browser-source overlays — without leaving Get Vaulted.",
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
  copyServer: "Copy RTMPS URL",
  copyKey: "Copy stream key",
  revealKey: "Reveal key",
  hideKey: "Hide key",
  rotateKey: "Rotate stream key",
  setupStream: "Set up stream",
  keyMissingHint:
    "Stream key was shown once when the channel was created. Click Rotate stream key to issue a new one, then paste it into OBS (Settings → Stream → Custom).",
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
      "In Seller HQ → OBS Studio, pick your show and click Connect OBS (or Set up stream) to create RTMPS credentials.",
      "Open OBS → Settings → Stream → Service: Custom.",
      "Paste the RTMPS ingest URL into Server and the stream key into Stream Key. The Server field must look like rtmps://….live-video.net:443/app/ (Get Vaulted copies it in that form).",
      "Recommended: Settings → Output → Video bitrate 4500–6000 Kbps, keyframe interval 2 s, encoder x264 or NVENC.",
      "Add Get Vaulted browser-source widgets (bid, sold, tips) from the Widgets section — generate a widget token and copy URLs with ?token= included.",
    ],
  },
  {
    id: "going-live",
    title: "Going live guide",
    body: [
      "Schedule your show (or use Start Show for an immediate go-live).",
      "Connect OBS and confirm Stream health shows Live or Connecting.",
      "Click Start Streaming in OBS — buyers see video after IVS detects your signal (usually a few seconds).",
      "Run the show from Host console or OBS Studio; inventory and chat stay in Get Vaulted.",
      "When finished, stop OBS first, then End show from Host console.",
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    body: [
      "Invalid Path or Connection URL in OBS: Server must be rtmps://….live-video.net:443/app/ — tap Copy RTMPS URL again (Get Vaulted now copies the full form).",
      "Connecting forever: confirm OBS shows “Streaming”, then Refresh status in Stream settings.",
      "Auth failed: rotate stream key, update OBS, and start streaming again.",
      "No video for buyers: verify the correct show is selected, RTMPS URL matches the active room, and you did not also tap phone Go Live (that switches buyers to camera/Stage).",
      "Dropped frames: lower bitrate or resolution in OBS Output settings.",
      "Widgets blank: confirm roomId in the widget URL matches your live show.",
      "401 on widgets: rotate the widget token in OBS Studio and update every browser source URL.",
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    body: [
      "Do I need OBS? No — you can use the in-browser camera in Host console. OBS is for pro RTMP setups.",
      "Can I reuse one stream key? Each show has its own IVS channel; rotate keys if you suspect a leak.",
      "Webcam + OBS? Use one path per show — either browser/phone camera (Go Live) or RTMP/OBS, not both. After Connect OBS, do not tap Go Live on the phone/console or buyers will wait on a camera that is not publishing.",
      "Mobile streaming? Use the Get Vaulted mobile host app; OBS Studio mode is optimized for desktop RTMP.",
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
