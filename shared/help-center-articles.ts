/**
 * Shared Help Center articles for mobile + web.
 * Body format: paragraphs separated by blank lines; lines starting with "• " are bullets; "1. " numbered steps.
 */

export type HelpSectionId =
  | 'buying'
  | 'selling'
  | 'live'
  | 'marketplace'
  | 'shipping'
  | 'payments'
  | 'trades'
  | 'disputes'
  | 'account'
  | 'trust';

export type HelpArticle = {
  id: string;
  sectionId: HelpSectionId;
  title: string;
  summary: string;
  body: string;
  keywords: string[];
};

export const HELP_SECTIONS: { id: HelpSectionId; title: string }[] = [
  { id: 'buying', title: 'Buying' },
  { id: 'selling', title: 'Selling' },
  { id: 'live', title: 'Live Shows' },
  { id: 'marketplace', title: 'Marketplace Listings' },
  { id: 'shipping', title: 'Shipping' },
  { id: 'payments', title: 'Payments & Payouts' },
  { id: 'trades', title: 'Trades' },
  { id: 'disputes', title: 'Disputes' },
  { id: 'account', title: 'Account' },
  { id: 'trust', title: 'Trust & Safety' },
];

export const HELP_ARTICLES: HelpArticle[] = [
  // ─── Buying ───────────────────────────────────────────────────────────────
  {
    id: 'buy-overview',
    sectionId: 'buying',
    title: 'How buying works on Get Vaulted',
    summary: 'Marketplace listings, live shows, wallet setup, and secure checkout.',
    body: `Get Vaulted connects collectors, live sellers, and verified inventory. You can purchase in two main ways:

• The Vault — async marketplace listings (Buy Now, offers, auctions, layaway on eligible items).
• Live shows — real-time auctions, Buy Now drops, break spots (PYT/PYD), and giveaways.

Before your first purchase, set up your Vault Wallet with a payment method and verified shipping address. This unlocks one-tap checkout in live rooms and faster marketplace checkout.

After you pay, track every purchase under My Account → Orders. Live purchases appear there too, with fulfillment status and tracking when the seller ships.`,
    keywords: ['buy', 'purchase', 'checkout', 'vault', 'overview'],
  },
  {
    id: 'buy-wallet',
    sectionId: 'buying',
    title: 'Set up your Vault Wallet',
    summary: 'Add payment and shipping before you bid or checkout.',
    body: `Your Vault Wallet holds your default payment method and shipping address. Live rooms and checkout both require a ready wallet.

On mobile:
1. Go to Settings → Vault Wallet (or My Account → Vault Wallet).
2. Add a payment method — card, Apple Pay, Google Pay, or other enabled methods.
3. Add a shipping address. Start typing your street for address suggestions, then save.
4. Confirm both show as ready (payment + shipping).

On web:
1. Sign in and open My Account → Wallet.
2. Add a card under Payment methods.
3. Add a shipping address under Shipping — use street autocomplete, then Verify and Save.

Tips:
• Use your legal name and a deliverable address — carriers reject incomplete addresses.
• Update your wallet before joining a live show so you do not miss a drop while fixing setup.`,
    keywords: ['wallet', 'payment', 'shipping', 'setup', 'card'],
  },
  {
    id: 'buy-marketplace-checkout',
    sectionId: 'buying',
    title: 'Buy Now on marketplace listings',
    summary: 'Complete secure checkout on a listing in The Vault.',
    body: `Buy Now purchases checkout immediately through Get Vaulted secure checkout.

On mobile:
1. Open The Vault tab and tap a listing.
2. Tap Buy Now (or the purchase button on the listing detail).
3. Confirm shipping address and payment — saved wallet info pre-fills when available.
4. Review item price, shipping, tax, and total.
5. Complete payment. You receive an order confirmation and can track status under My Account → Orders.

On web:
1. Browse marketplace listings and open a listing page.
2. Click Buy Now to open checkout.
3. Enter or select your shipping address (street autocomplete available).
4. Choose a shipping rate when carrier rates apply.
5. Pay with your saved card or enter payment at Stripe checkout.

After purchase:
• The seller is notified to fulfill.
• Tracking appears on your order detail when a label is created.
• Message the seller from the order page for fulfillment questions only — not payment changes.`,
    keywords: ['buy now', 'marketplace', 'checkout', 'order'],
  },
  {
    id: 'buy-auction-bid',
    sectionId: 'buying',
    title: 'Bid on marketplace auctions',
    summary: 'Place bids, set a max bid, and win with secure checkout.',
    body: `Some marketplace listings run timed auctions instead of fixed Buy Now pricing.

How to bid on mobile:
1. Open a listing in auction mode from The Vault.
2. Enter your max bid or use the bid controls shown on the listing.
3. Confirm your Vault Wallet is ready — you need payment on file if you win.
4. If you are outbid, you can raise your max bid before the auction ends.
5. If you win, complete checkout or follow the prompt to pay — unpaid wins may expire.

How to bid on web:
1. Open the listing page and sign in.
2. Use the Place Bid modal — confirm shipping address and payment method.
3. Submit your max bid. The system bids up to your max on your behalf.
4. Watch the auction timer. Winners are charged or prompted to pay per listing rules.

Good practices:
• Bid only what you are willing to pay including shipping and tax.
• Check the seller's rating and item authentication badges before bidding.
• Review shipping terms — some items use flat rate, others use live carrier quotes.`,
    keywords: ['auction', 'bid', 'max bid', 'win'],
  },
  {
    id: 'buy-layaway',
    sectionId: 'buying',
    title: 'Start a layaway purchase',
    summary: 'Reserve eligible $500+ items with a deposit and pay over time.',
    body: `Layaway lets you reserve select high-value marketplace listings with a non-refundable deposit, then pay the balance over 30 or 60 days.

Eligibility:
• Listing must have layaway enabled (typically $500+ Buy Now items).
• You can only have one active layaway at a time.

How to start layaway:
1. Open an eligible listing in The Vault.
2. Choose Layaway instead of Buy Now.
3. Select a 30-day or 60-day plan and acknowledge layaway terms (deposit is non-refundable).
4. Enter shipping address and pay the deposit through secure checkout.
5. The listing is reserved for you while layaway is active.

Paying the balance:
• Open My Account → Layaways to see remaining balance and due dates.
• Pay installments until paid in full.
• Shipping unlocks only after the item is paid in full — sellers should not ship early.

If you default or cancel:
• The listing may become available to other buyers again.
• Deposit terms are explained at checkout — read them before starting.`,
    keywords: ['layaway', 'deposit', 'installment', 'reserve'],
  },
  {
    id: 'buy-track-orders',
    sectionId: 'buying',
    title: 'Track your orders',
    summary: 'Find marketplace and live purchases, tracking, and receipts.',
    body: `All paid purchases appear in your order history with fulfillment status.

On mobile:
1. Go to Settings → My Account → Orders (or Account Hub → Orders).
2. Tap an order to see item details, seller info, payment summary, and shipping status.
3. When the seller creates a label, tracking number and carrier link appear on the order detail.
4. Live show purchases use the same order list — filter or scroll to find recent live wins.

On web:
1. Sign in and open My Account → Orders.
2. Click an order for shipment status, tracking, and refund options if available.

Order statuses you may see:
• Paid / awaiting shipment — seller preparing fulfillment.
• Label created / in transit — tracking active.
• Delivered — carrier confirmed delivery; payout timers may start for sellers.
• Exception — label or carrier issue; contact support if stuck.

Need help with an order?
• Minor issues: message the seller from the order page.
• Serious issues (non-delivery, wrong item, damage): request a refund or open a dispute from order detail.`,
    keywords: ['orders', 'tracking', 'status', 'receipt'],
  },

  // ─── Selling ──────────────────────────────────────────────────────────────
  {
    id: 'sell-get-approved',
    sectionId: 'selling',
    title: 'Become an approved seller',
    summary: 'Complete seller setup to unlock Seller HQ and go live.',
    body: `Selling on Get Vaulted requires an approved seller account with payouts and ship-from address on file.

Start seller setup:
1. Sign in and go to Settings → Seller Setup (mobile) or apply from the seller path on web.
2. Complete each step: profile details, Stripe Connect payouts, and ship-from address.
3. Use street address autocomplete and verify your ship-from address — labels pull from this address.
4. Finish any remaining checklist items (identity, policies, etc. as prompted).
5. When approved, Seller HQ unlocks on mobile (tab bar) and seller tools on web.

Before your first sale:
• Confirm Stripe Connect shows as connected and payouts enabled.
• Ship-from address must be complete and verified — missing fields block label creation.
• Review seller policies on shipping timelines and authentication claims.

You cannot host Vault Events or publish inventory until setup is complete and your account is in good standing.`,
    keywords: ['seller', 'apply', 'setup', 'approved'],
  },
  {
    id: 'sell-obligations',
    sectionId: 'selling',
    title: 'Seller obligations (what you must do)',
    summary: 'Listing accuracy, shipping, live rules, layaway, payouts, and enforcement.',
    body: `As a Get Vaulted seller, you are an independent seller — not an employee of Get Vaulted. You are responsible for your inventory, listings, fulfillment, and compliance. Full legal terms are in our Terms of Service (Seller Responsibility section).

Account setup you must maintain:
1. Complete seller setup and Stripe Connect payouts — keep bank and tax info current.
2. Keep a verified ship-from address on file — labels and quotes fail without it.
3. Fix Seller HQ readiness warnings before publishing or going live.

Listing and authenticity:
• Describe condition, flaws, and inclusions honestly — use real photos of the item sold.
• Grading and Vault Verified claims must match what you ship (slab serials, labels, etc.).
• Set accurate handling time, shipping method, and package weight used for rate quotes.
• Disclose break format, spot type (PYT, PYD, random), and Cards vs Helmets before selling live.

Fulfillment:
1. Ship paid orders within your stated handling time.
2. Ship the exact item described — no substitutions without buyer consent.
3. Use platform label flows when provided; do not move buyers off-platform to evade fees or protections.
4. Package collectibles securely and ensure tracking scans update for buyers.
5. Never ship layaway orders until paid in full.

Live shows:
• Honor sold spots, winning bids, and Buy Now purchases.
• State break rules and randomization clearly before taking money.
• Fulfill live sales with the same shipping standards as marketplace orders.
• Honor giveaways and promotions according to in-room rules.

Customer service and disputes:
• Respond to buyers and refund requests promptly.
• Cooperate with Get Vaulted investigations — provide tracking and photos when asked.
• Do not ask buyers to pay off-platform or cancel orders to bypass checkout.

Fees and payouts:
• Platform and payment fees apply as disclosed at listing or checkout.
• Payouts may be delayed for delivery confirmation, chargebacks, fraud review, or policy holds.
• You are responsible for chargebacks and processor penalties tied to your sales.

Prohibited conduct includes counterfeit or stolen goods, shill bidding, harassment, fake accounts, and scraping buyer data for off-platform sales.

Violations can lead to listing removal, live bans, payout holds, refunds, suspension, or permanent termination.`,
    keywords: ['seller obligations', 'responsibility', 'rules', 'policy', 'fulfillment', 'authenticity'],
  },
  {
    id: 'sell-studio',
    sectionId: 'selling',
    title: 'Seller Studio and Seller HQ overview',
    summary: 'Inventory, events, fulfillment, and revenue in one place.',
    body: `Seller HQ (mobile tab bar) and Seller Studio (web) are your command centers.

Main areas:
• Inventory — active listings, drafts, and live queue items tied to shows.
• Vault Events — schedule and manage live shows and breaks.
• Fulfillment — orders awaiting labels and shipments.
• Revenue / Payouts — Stripe balance, payout schedule, and sales summaries.
• Layaways — active buyer layaways on your listings (do not ship until paid in full).

Daily workflow:
1. Stage inventory before a show.
2. Schedule or open a Vault Event.
3. Run the show from Command Center (mobile) or the live host view (web).
4. After sales, print labels from Fulfillment and ship on time.
5. Track payouts in Revenue — funds release per platform payout rules after delivery.

Use Seller HQ setup cards to fix missing ship-from, payout, or readiness issues before going live.`,
    keywords: ['seller hq', 'studio', 'inventory', 'fulfillment'],
  },
  {
    id: 'sell-create-listing',
    sectionId: 'selling',
    title: 'Create a marketplace listing',
    summary: 'Photos, pricing, shipping, authentication, and publish.',
    body: `List items in The Vault for Buy Now, auction, offers, trades, or layaway (when eligible).

On mobile:
1. Open Seller HQ → Inventory → Create listing (or the create listing flow from inventory).
2. Add clear photos, title, category, condition, and description.
3. Choose sale format: Buy Now, auction, or enable offers/trades as supported.
4. Set price, shipping (flat or calculated), and handling time.
5. Enable Vault Verified or authentication fields if applicable.
6. For $500+ items, you may enable layaway — buyers pay a deposit then installments.
7. Review and publish. The listing appears in The Vault when active.

On web:
1. Go to Sell → Create listing.
2. Follow the same steps for media, pricing, shipping, and publish.

Tips:
• Accurate condition and photos reduce disputes.
• Ship-from address must be valid before shipping quotes work correctly.
• Edit or end listings from Inventory if price or quantity changes.`,
    keywords: ['listing', 'create', 'publish', 'inventory'],
  },
  {
    id: 'sell-schedule-event',
    sectionId: 'selling',
    title: 'Schedule a Vault Event',
    summary: 'Create live shows, breaks, and recurring schedules.',
    body: `Vault Events are scheduled live shows buyers discover on the Live tab.

Schedule an event on mobile:
1. Seller HQ → Vault Events → Schedule event.
2. Choose format: Break, Auction show, or other available room types.
3. For breaks, pick break category inside Break setup (Cards or Helmets) — not a separate top-level field.
4. Set title, cover image, start time, and visibility.
5. Optionally configure recurring schedule if offered for your account tier.
6. Save. Share the event link so collectors can RSVP or join when live.

Schedule on web:
1. Open Seller Live / schedule flow from seller dashboard.
2. Match the same break setup — Cards vs Helmets lives under Break setup.
3. Confirm readiness checklist (payouts, ship-from, OBS if streaming) before going live.

Before you go live:
• Stage queue inventory in Command Center.
• Test stream setup (OBS or in-app) if broadcasting video.
• Verify ship-from and payout status — blocked sellers cannot complete fulfillment.`,
    keywords: ['vault event', 'schedule', 'break', 'live show'],
  },
  {
    id: 'sell-run-live',
    sectionId: 'selling',
    title: 'Run a live show (Command Center)',
    summary: 'Queue, pin items, auctions, Buy Now, and break spots.',
    body: `When your Vault Event is live, run sales from Command Center (mobile) or the host console (web).

Host workflow:
1. Open your live room from Vault Events → Go live / Command Center.
2. Add inventory to the queue — auctions, Buy Now, PYT, PYD, random spots, etc.
3. Pin or start the active item so buyers see it in the room.
4. For auctions: set starting bid, reserve if used, and monitor bid timer.
5. For PYT/PYD: buyers pick teams or divisions from the spot grid; random variants use a wheel reveal.
6. For Buy Now: buyers purchase at your fixed price while the item is active.
7. When an item sells, move to the next queue item.

During the show:
• Monitor chat and presence; use moderation tools as needed.
• Watch for wallet-ready buyers — sales fail if buyers lack payment or shipping on file.
• Giveaways (if enabled) run on separate rails — follow in-room prompts.

After the show:
• Fulfill all orders from Seller HQ → Fulfillment.
• Print labels promptly to maintain seller metrics.`,
    keywords: ['command center', 'host', 'queue', 'pin', 'go live'],
  },
  {
    id: 'sell-fulfill',
    sectionId: 'selling',
    title: 'Fulfill orders and print labels',
    summary: 'Create Shippo labels, ship on time, and handle exceptions.',
    body: `After a sale, create a shipping label and ship within your stated handling time.

Fulfill from Seller HQ:
1. Open Fulfillment (or Sales → awaiting shipment).
2. Tap an order to review buyer ship-to address and item details.
3. Confirm package weight/dimensions if prompted.
4. Purchase or generate the protected label through Get Vaulted (Shippo-backed).
5. Print the label, attach to package, and drop off with the carrier.
6. Tracking syncs to the buyer's order automatically.

If label creation fails:
• Check your ship-from address is verified and complete.
• Check buyer address — exceptions often mean invalid or incomplete addresses.
• Use Regenerate label or Repair label tools on the order if available.
• Contact support with the order ID if the error persists.

Bundling:
• Some flows support bundled labels for multiple orders to the same buyer — use when offered to save on postage.

Never ship outside the platform label flow for protected orders unless support directs you — off-platform shipping can void seller protections.`,
    keywords: ['fulfill', 'label', 'shippo', 'ship', 'tracking'],
  },
  {
    id: 'sell-payouts',
    sectionId: 'selling',
    title: 'Connect Stripe payouts',
    summary: 'Link your bank, understand payout timing, and view revenue.',
    body: `Seller payouts run through Stripe Connect. You must connect before withdrawing sales proceeds.

Connect payouts:
1. Open Seller Setup or Seller HQ → Revenue / Payouts.
2. Tap Connect with Stripe and complete Stripe's identity and bank onboarding.
3. Return to Get Vaulted — status should show connected.
4. Keep your bank details current in Stripe if you change accounts.

Payout timing:
• Funds typically hold until delivery confirmation or platform escrow rules clear.
• High-value orders may use extended escrow — see order detail for status.
• Payout speed depends on your bank and Stripe — not instant in all cases.

View earnings:
• Revenue dashboard shows gross sales, fees, and pending vs available balance.
• Each order detail shows fee breakdown where applicable.

Taxes:
• You are responsible for seller tax obligations. Stripe may collect tax info during onboarding.
• Download reports from Stripe for accounting as needed.`,
    keywords: ['stripe', 'payout', 'connect', 'bank', 'revenue'],
  },

  // ─── Live Shows ───────────────────────────────────────────────────────────
  {
    id: 'live-join',
    sectionId: 'live',
    title: 'Join a live room',
    summary: 'Discover shows, enter as guest or signed-in buyer, and follow chat.',
    body: `Live rooms are real-time shopping events hosted by sellers.

Join a show:
1. Open the Live tab (mobile) or Live directory (web).
2. Browse live now, upcoming, or break rooms — break tiles may show "Break - Cards" or "Break - Helmets".
3. Tap a room card to enter.
4. Guests can usually watch; sign in to bid, buy, chat, or claim spots.
5. Follow the host and read pinned commerce info for the active item.

In the room:
• Video stream (when enabled), live chat, and viewer presence count.
• Active item panel shows what is for sale right now.
• Wallet banner appears if you need payment or shipping setup.

Sharing:
• Use Share on the room to copy a link for friends.
• RSVP or reminders may appear for scheduled Vault Events.

Reporting problems:
• Use report tools on chat users or Contact Support with the room name and time for serious issues.`,
    keywords: ['live', 'room', 'join', 'watch', 'chat'],
  },
  {
    id: 'live-bid',
    sectionId: 'live',
    title: 'Bid in live auctions',
    summary: 'Hold to bid, max bids, and winning checkout.',
    body: `Live auctions run on a timer tied to the host's active queue item.

Before bidding:
1. Sign in and open a live wallet-ready state (payment + shipping on file).
2. Enter the live room while the item you want is active (pinned by host).

Place a bid on mobile:
1. Watch the current price and timer on the commerce bar.
2. Use Hold to Bid or the bid button shown for the active item.
3. Confirm your bid — bids are binding when the timer ends.
4. If outbid, bid again before time expires.
5. If you win, payment runs against your wallet card on file or prompts you to complete checkout.

On web:
1. Same flow in the live auction room — confirm wallet readiness.
2. Enter bid amount or use quick bid increments as shown.

Tips:
• Latency matters near timer end — bid early enough to avoid missing the close.
• Ensure sufficient card limit for hammer price plus shipping/tax.
• Won items appear under My Account → Orders for tracking.`,
    keywords: ['live auction', 'bid', 'hold to bid', 'win'],
  },
  {
    id: 'live-buy-now',
    sectionId: 'live',
    title: 'Buy Now during live shows',
    summary: 'Fixed-price drops while an item is active.',
    body: `Buy Now live lots sell at a fixed price while the host has them active.

How to purchase:
1. Join the live room and wait for the host to pin a Buy Now item.
2. Tap Buy Now on the commerce bar or item panel.
3. Confirm shipping and payment via your live wallet.
4. On success, you receive confirmation in-room and an order record.

Requirements:
• Vault Wallet must be ready before tapping Buy Now — setup opens automatically if not.
• Items sell first-come, first-served — popular drops go fast.

After purchase:
• View the order under My Account → Orders.
• Seller fulfills with a platform label like marketplace orders.
• Do not send payment outside the app.`,
    keywords: ['buy now', 'live', 'drop', 'fixed price'],
  },
  {
    id: 'live-pyt-pyd',
    sectionId: 'live',
    title: 'PYT and PYD break spots',
    summary: 'Pick Your Team and Pick Your Division self-serve checkout.',
    body: `Breaks let buyers claim teams (PYT) or divisions (PYD) from a spot grid.

PYT — Pick Your Team:
• Common in NFL/team breaks — up to 32 team spots.
• When the host activates a PYT lot, tap Claim Team or open the spot sheet from the commerce bar.
• Pick an available team spot and checkout at the listed spot price.

PYD — Pick Your Division:
• AFC/NFC divisions or similar — typically 8 spots.
• Tap Claim Division, choose an open division, and pay.

Self-serve flow:
1. Wallet must be ready.
2. Open the spot grid sheet (not the seller's host board — buyers use the buyer checkout sheet only).
3. Select an available spot labeled with team or division name.
4. Confirm payment. Sold spots show as taken for other buyers.

Cards vs Helmets breaks:
• Break rooms display category on tiles (e.g., "Break - Cards" or "Break - Helmets") so you know the product type before entering.`,
    keywords: ['pyt', 'pyd', 'pick your team', 'pick your division', 'break'],
  },
  {
    id: 'live-random-spots',
    sectionId: 'live',
    title: 'Random team and division spots',
    summary: 'Random PYT/PYD assignments and wheel reveals.',
    body: `Random break spots assign teams or divisions by chance instead of manual pick.

Random PYT (Random Teams):
• You buy a spot without choosing the team.
• The host runs a wheel or reveal to assign your team from remaining teams.

Random PYD (Random Divisions):
• Same pattern for divisions — typically 8 division spots.

How to buy a random spot:
1. When the host activates a random lot, tap the commerce action shown (Buy Spot or similar).
2. Pay the listed spot price with your live wallet.
3. Watch the reveal in-room for your assignment.

Notes:
• Random spots are non-refundable once assigned except under standard dispute/refund policies.
• All spots must sell (or host rules apply) before some breaks proceed — follow host chat instructions.`,
    keywords: ['random', 'wheel', 'team break', 'division'],
  },
  {
    id: 'live-wallet',
    sectionId: 'live',
    title: 'Live Wallet during a show',
    summary: 'Fix payment or shipping without leaving the room.',
    body: `The Live Wallet sheet opens when you need to bid, buy, or claim spots but are not checkout-ready.

Open Live Wallet:
• Tap the wallet banner or readiness prompt inside a live room.
• Or open Settings → Vault Wallet before joining.

In the sheet:
1. Add or change default payment method.
2. Add or edit shipping address — use street autocomplete suggestions.
3. Apply promo or referral credits if available.
4. Return to the room — readiness refreshes automatically when complete.

Recovery mode:
• If a charge fails, follow the in-room error message — it often opens wallet recovery directly to the missing step.

Live wallet uses the same saved payment and address as marketplace checkout once configured.`,
    keywords: ['live wallet', 'payment', 'readiness', 'checkout'],
  },
  {
    id: 'live-giveaway',
    sectionId: 'live',
    title: 'Live giveaways',
    summary: 'Enter giveaways and claim prizes during shows.',
    body: `Hosts may run giveaways during Vault Events for promotional prizes.

How giveaways work:
1. When a giveaway is active, an entry button or banner appears in the live room.
2. Tap to enter while the entry window is open — some giveaways require you to be present in-room.
3. If you win, follow the on-screen claim flow before the claim window expires.
4. Won giveaways may create a fulfillment order — add a valid shipping address in your wallet.

Rules:
• One entry per user unless the host states otherwise.
• Fake accounts or abuse can disqualify entries under Trust & Safety policies.
• Physical prizes ship like small orders — track status under Orders if an order is created.

Did not receive a prize?
• Contact Support with the room name, date, and screenshot of the win if needed.`,
    keywords: ['giveaway', 'entry', 'prize', 'claim'],
  },

  // ─── Marketplace ──────────────────────────────────────────────────────────
  {
    id: 'mkt-browse',
    sectionId: 'marketplace',
    title: 'Browse The Vault marketplace',
    summary: 'Categories, search, filters, and listing details.',
    body: `The Vault is Get Vaulted's async marketplace for listings outside live shows.

Browse on mobile:
1. Open The Vault tab.
2. Swipe category lanes — Sports Cards, Memorabilia, Sneakers, Watches, and more.
3. Tap Search to find titles, sellers, or keywords.
4. Open a listing for photos, price, shipping, seller rating, and authentication badges.

Browse on web:
1. Go to Marketplace from the main navigation.
2. Filter by category, price, or authentication where available.
3. Open listing pages for full detail and checkout.

Listing detail checklist:
• Item condition and description
• Buy Now or offer availability (timed bidding is currently only in live shows, not marketplace listings)
• Shipping cost or calculated rates at checkout
• Seller location and handling time
• Vault Pick / Vault Verified badges — see "Vault Verified listings" for what these do and don't mean

Save listings:
• Use watchlist/heart tools when available to track price changes.`,
    keywords: ['marketplace', 'vault', 'browse', 'category', 'search'],
  },
  {
    id: 'mkt-offers',
    sectionId: 'marketplace',
    title: 'Make an offer on a listing',
    summary: 'Send, edit, and negotiate offers with sellers.',
    body: `When offers are enabled, you can negotiate below the listed price.

Make an offer:
1. Open a listing that shows Make Offer.
2. Enter your offer amount and optional message.
3. Submit — the seller accepts, declines, or counters.

After submitting:
• Check My Account → Offers (or Messages/notifications) for responses.
• Counteroffers may expire — respond before the deadline.
• If accepted, complete checkout at the agreed price promptly.

Tips:
• Reasonable offers based on comps get faster responses.
• Offers are not binding until accepted and paid.
• Trades may be available separately on eligible listings — see Trade Center articles.`,
    keywords: ['offer', 'negotiate', 'counter', 'make offer'],
  },
  {
    id: 'mkt-watchlist',
    sectionId: 'marketplace',
    title: 'Watchlist and saved listings',
    summary: 'Track items and get notified about activity.',
    body: `Save listings you are considering so you can find them quickly later.

Save a listing:
1. Tap the watchlist/heart icon on a listing card or detail page.
2. View saved items from your account activity or watchlist section when available.

Notifications:
• Enable push notifications in Settings for price drops, offer responses, and outbid alerts.
• Check the notification inbox for marketplace activity.

Removing saves:
• Tap the heart/watchlist icon again to unsave.

Watchlist does not reserve inventory — high-demand items can sell while saved. Checkout promptly when ready to buy.`,
    keywords: ['watchlist', 'save', 'heart', 'notify'],
  },
  {
    id: 'mkt-verified',
    sectionId: 'marketplace',
    title: 'Vault Verified listings',
    summary: 'What our seller and listing badges actually mean.',
    body: `Get Vaulted currently uses two different badges — read what each one actually means before you rely on it:

• "Vault Verified" (seller badge) reflects the seller's account standing and payout history on Get Vaulted (an internal performance tier). It is not an authentication of any specific item.
• "Vault Pick" (listing badge) is a featured/editorial flag a seller can apply to their own listing. It is not an authentication or grading claim.

Get Vaulted does not currently run a per-item authentication program. If a listing shows a third-party grading claim (PSA, BGS, SGC, etc.), that claim comes from the seller — check that the grade and cert number in the description match what's shown in the photos before you buy.

If an item doesn't match its description after delivery:
• Document the item with photos immediately.
• For a live-show order, use the in-app refund/return request within 2 days of delivery.
• For a marketplace order, message the seller first, then contact support@shopgetvaulted.com if it isn't resolved. (Pre-ship cancel is available in-app before a Get Vaulted label is created — see Disputes.)
• Do not alter graded slabs before support review when disputes involve grading claims.`,
    keywords: ['verified', 'authentication', 'badge', 'authentic', 'vault pick'],
  },

  // ─── Shipping ─────────────────────────────────────────────────────────────
  {
    id: 'ship-buyer-address',
    sectionId: 'shipping',
    title: 'Add and verify your shipping address',
    summary: 'Autocomplete, verification, and carrier-ready formatting.',
    body: `Accurate shipping addresses prevent label failures and delivery issues.

Add an address on mobile:
1. Settings → Vault Wallet → Shipping → Add address.
2. Start typing your street — pick a suggestion to auto-fill city, state, and ZIP.
3. Save. The server validates through Shippo when configured.

Add an address on web:
1. My Account → Wallet → Shipping.
2. Use street autocomplete, then Verify, then Save.

Verification:
• Verified addresses are corrected to carrier-preferred formatting when Shippo finds issues.
• If verification fails, fix typos or choose the suggested corrected address.

Tips:
• Use apartment/unit in line 2 when needed.
• PO Boxes may not work for all sellers or carriers.
• Update address before rebidding — live charges use your default ship-to.`,
    keywords: ['address', 'verify', 'autocomplete', 'shipping'],
  },
  {
    id: 'ship-rates',
    sectionId: 'shipping',
    title: 'Shipping rates at checkout',
    summary: 'Flat rate vs live carrier quotes for buyers.',
    body: `Shipping cost depends on how the seller configured the listing.

Flat-rate shipping:
• Fixed price shown on listing — no rate shopping at checkout.
• Common on live Buy Now lots and some marketplace items.

Calculated carrier rates:
• At checkout, enter your address to load USPS/UPS/FedEx options (when enabled).
• Pick speed vs price — your choice is saved as a preference when offered.
• Tax and total update after you select a rate.

Live show purchases:
• Shipping may be flat per host rules or calculated after win — follow in-room totals.

International:
• Not all sellers ship internationally — check listing ship regions before buying.`,
    keywords: ['shipping rates', 'carrier', 'usps', 'flat rate'],
  },
  {
    id: 'ship-seller-ship-from',
    sectionId: 'shipping',
    title: 'Set your seller ship-from address',
    summary: 'Required for labels, quotes, and tax calculation.',
    body: `Every seller must maintain a verified ship-from address used on all labels.

Update ship-from on mobile:
1. Seller HQ setup cards or Seller Setup wizard → Shipping step.
2. Enter street with autocomplete, city, state, ZIP (US sellers typically ship from US).
3. Save — validation runs on the server.

Update on web:
1. Seller Setup → Shipping or Account → Seller settings ship-from section.
2. Verify address before saving.

Why it matters:
• Label purchase fails if ship-from is missing or invalid.
• Shipping quotes to buyers use distance from your ship-from.
• Keep it updated if you move warehouses or P.O. box locations.`,
    keywords: ['ship from', 'seller address', 'warehouse'],
  },
  {
    id: 'ship-labels',
    sectionId: 'shipping',
    title: 'Print labels and tracking',
    summary: 'Buyer tracking view and seller label workflow.',
    body: `Buyers:
1. Open My Account → Orders → order detail.
2. When the seller creates a label, tracking number and carrier appear.
3. Tap tracking to open carrier site for scans.

Sellers:
1. Fulfillment → select order → Create label.
2. Print PDF label and attach to package.
3. Mark shipped if manual confirmation is required (platform may auto-update on scan).

Trades:
• Accepted trades generate label flows for each party — see Trade shipping article.

Bundled shipments:
• Some sellers combine multiple orders to one buyer — tracking may share one label.`,
    keywords: ['label', 'tracking', 'print', 'carrier'],
  },
  {
    id: 'ship-issues',
    sectionId: 'shipping',
    title: 'Shipping delays and exceptions',
    summary: 'What fulfillment "exception" means and what to do.',
    body: `Shipping exception on an order means label creation or carrier handoff failed — it is usually not a payment problem.

Common causes:
• Invalid buyer or seller address
• Carrier API outage
• Weight/dimension missing for calculated labels
• Service not available for destination

If you are a buyer:
1. Check order detail for error notes.
2. Message the seller once — they may regenerate the label after fixing address.
3. If stuck for days, request a refund or Contact Support with order ID.

If you are a seller:
1. Confirm ship-from and buyer addresses are verified.
2. Use Regenerate / Repair label on the order page.
3. Contact support with order ID if Shippo errors repeat.

Lost packages after ship:
• Wait for carrier investigation window.
• Open a dispute if delivered scan never appears and seller is unresponsive.`,
    keywords: ['exception', 'delay', 'lost', 'shipping problem'],
  },

  // ─── Payments ─────────────────────────────────────────────────────────────
  {
    id: 'pay-wallet',
    sectionId: 'payments',
    title: 'Add and manage payment methods',
    summary: 'Cards, Apple Pay, Google Pay, and defaults.',
    body: `Payment methods attach to your Vault Wallet for marketplace and live checkout.

Add a card on mobile:
1. Settings → Vault Wallet → Payment.
2. Add card or use Apple Pay / Google Pay setup when shown.
3. Set default payment method.

Add on web:
1. My Account → Wallet → Payment methods → Add card via Stripe Elements.

Manage methods:
• Remove old cards when expired.
• Default card is charged for live wins and wallet checkout.
• Some live rooms show accepted methods in the wallet sheet.

Declined charges:
• Check card limit, billing ZIP, and bank fraud blocks.
• Update payment in Live Wallet and retry if a live charge failed.`,
    keywords: ['payment', 'card', 'apple pay', 'google pay'],
  },
  {
    id: 'pay-checkout',
    sectionId: 'payments',
    title: 'How checkout charges work',
    summary: 'Item price, shipping, tax, fees, and receipts.',
    body: `Checkout totals include line items shown before you pay:

• Item price (or winning bid / spot price)
• Shipping — flat or selected carrier rate
• Sales tax — calculated when tax collection applies to your ship-to
• Platform or escrow fees — shown on high-value or protected transactions when applicable

Marketplace Buy Now / layaway deposit:
• Stripe checkout or saved payment method charges the shown total.
• Email receipt comes from Stripe/Get Vaulted notifications.

Live purchases:
• Charge runs against wallet default when you win or Buy Now.
• Failed charges open wallet recovery — item may pass to next buyer if unpaid.

Always review the total on the confirmation screen before submitting payment.`,
    keywords: ['checkout', 'tax', 'total', 'charge', 'receipt'],
  },
  {
    id: 'pay-seller-stripe',
    sectionId: 'payments',
    title: 'Seller payouts through Stripe',
    summary: 'Available balance, holds, and withdrawals.',
    body: `Buyers pay Get Vaulted; sellers receive net proceeds via Stripe Connect.

Key concepts:
• Gross sale minus platform fees = net to seller (per order rules).
• Funds may be pending until delivery or escrow release.
• Available balance can be paid out to your bank on Stripe's schedule.

Actions:
1. Connect Stripe in Seller Setup if not done.
2. View Revenue for pending vs available amounts.
3. Complete Stripe identity updates if payouts pause for verification.

Payout paused?
• Log into Stripe Express dashboard link from seller settings.
• Fix bank account or ID verification requests.
• Contact support if platform shows connected but payouts still blocked.`,
    keywords: ['payout', 'stripe connect', 'balance', 'withdraw'],
  },
  {
    id: 'pay-fees',
    sectionId: 'payments',
    title: 'Platform fees and escrow',
    summary: 'When escrow applies and what fees cover.',
    body: `Get Vaulted uses fees and escrow to protect high-value collector transactions.

Escrow (when applicable):
• Qualifying order totals may enter escrow hold until delivery confirmation.
• Buyers see Vaulted Secure Checkout messaging at checkout.
• Sellers see pending payout until release conditions met.

Trade fees:
• Vault-to-vault trades include a protection fee based on shipping weight tier — shown before you send an offer.

Live and marketplace:
• Seller fee schedules appear in seller terms and order breakdowns.

Questions about a specific charge?
• Open the order or trade detail for fee lines.
• Contact Support with order ID for billing disputes — do not chargeback without contacting support first.`,
    keywords: ['fees', 'escrow', 'secure checkout', 'trade fee'],
  },

  // ─── Trades ───────────────────────────────────────────────────────────────
  {
    id: 'trade-send',
    sectionId: 'trades',
    title: 'Send a trade offer',
    summary: 'Offer your items plus optional cash for a listing.',
    body: `Trade Center lets collectors swap inventory with optional cash adjustments.

Send an offer on mobile:
1. Open a listing that allows trades (or Trade Center → find target listing).
2. Tap Trade or Make trade offer.
3. Select listings from your inventory to offer.
4. Add cash on your side or request cash from them if the trade is uneven.
5. Choose shipping weight tier — sets trade protection fee.
6. Add a message and send.

On web:
1. Open listing → Trade offer flow (sign in required).
2. Same steps for offered items, cash, and message.

Rules:
• You can only offer listings you own and that are active.
• Cannot trade with yourself.
• One active offer per target trade pair may apply — cancel old offers before resending.`,
    keywords: ['trade', 'offer', 'send', 'swap'],
  },
  {
    id: 'trade-respond',
    sectionId: 'trades',
    title: 'Counter, accept, or decline trades',
    summary: 'Manage incoming and outgoing offers in Trade Center.',
    body: `View all trade activity in Trade Center (mobile tab or web /trade).

Incoming offers:
1. Open Trade Center → Incoming.
2. Review offered items, cash, and fees.
3. Accept, decline, or counter with your own terms.

Outgoing offers:
• Track status: pending, countered, accepted, declined, expired.
• Withdraw or update before acceptance if the app allows.

After acceptance:
• Both parties must complete shipping steps — see trade shipping article.
• Active trades block account deletion until completed or canceled per policy.`,
    keywords: ['counter', 'accept', 'decline', 'trade center'],
  },
  {
    id: 'trade-ship',
    sectionId: 'trades',
    title: 'Trade shipping labels',
    summary: 'Ship your side after a trade is accepted.',
    body: `Accepted trades require both parties to ship using protected labels when provided.

Steps:
1. Open Trade Center → active trade detail.
2. Review ship-by dates and label purchase buttons.
3. Generate your outbound label to the other party's verified address.
4. Ship within the stated window and confirm tracking in the trade timeline.

If label fails:
• Verify your ship-from address and trade partner address on file.
• Contact support with trade ID before shipping outside the platform.

Both shipments may need to scan before trade completes and items release per trade rules.`,
    keywords: ['trade shipping', 'label', 'ship by'],
  },
  {
    id: 'trade-complete',
    sectionId: 'trades',
    title: 'Complete a trade',
    summary: 'Timeline, delivery confirmation, and trade disputes.',
    body: `Trade detail shows a protected timeline of offer, acceptance, labels, and delivery.

Completion:
• Both sides ship and carriers scan packages.
• Confirm receipt in-app when prompted if delivery confirmation is required.
• Trade moves to completed — listings transfer per platform rules.

Problems:
• Non-shipment: open dispute from trade detail after ship-by date passes.
• Wrong item or damage: photo document and open dispute promptly.
• Do not complete the trade in-app if you did not receive the correct items.

Trade disputes follow similar evidence rules as order disputes — include photos and tracking.`,
    keywords: ['complete trade', 'timeline', 'delivery', 'confirm'],
  },

  // ─── Disputes ─────────────────────────────────────────────────────────────
  {
    id: 'disp-when',
    sectionId: 'disputes',
    title: 'When to dispute vs request a refund',
    summary: 'Pick the right path — it depends on how you bought.',
    body: `The right tool depends on how the order happened:

Live show orders (Vault Events):
• Use the in-app refund/return request, available up to 2 days after delivery is confirmed (photos may be required).
• Cancel before the seller ships if you change your mind after a live win, subject to the host's rules for that show.
• If the seller denies your request, escalate to Get Vaulted support from the refund panel.

Trade Center orders (escrow-protected trades):
• Use the in-app dispute tool for non-delivery, authenticity fraud, or a partner who fails to ship on an accepted trade.

Marketplace (Buy Now / accepted offer) orders:
• Use the in-app cancel request on order detail before the seller ships or creates a Get Vaulted shipping label. The seller must approve; on approval you get a full refund of the amount charged.
• Cancel is unavailable after a Get Vaulted label exists or the order has shipped.
• After delivery (or if cancel isn't available), message the seller first, then contact support@shopgetvaulted.com with your order ID if it isn't resolved.

All order types:
• Payment-network chargebacks remain available through your card issuer or bank, subject to their rules.
• Platform bugs, double-charges, or safety emergencies should go straight to support.

Not for disputes or refunds:
• Buyer remorse on correctly described items where returns aren't offered.
• Chat disagreements — use block/report instead.`,
    keywords: ['dispute', 'refund', 'when', 'help'],
  },
  {
    id: 'disp-open',
    sectionId: 'disputes',
    title: 'Open a dispute (Trade Center)',
    summary: 'Evidence, timelines, and what happens next for trades.',
    body: `The in-app dispute tool applies to Trade Center (escrow-protected) trades. Marketplace and live-show orders use the refund/return tools described in "When to dispute vs request a refund" instead.

Open from mobile or web:
1. Trade detail → Open dispute.
2. Choose reason category.
3. Describe the issue clearly with dates and facts.
4. Attach photos if available (damage, wrong item, empty package, etc.).
5. Submit — status shows on the dispute detail timeline.

What to expect:
• Your trade partner may respond with their evidence.
• Get Vaulted reviews both sides under marketplace policies.
• Outcomes may include a refund of your side of the trade, partial resolution, or denial with explanation.

Tips:
• Keep packaging photos for shipping damage claims.
• Continue polite messaging with your trade partner — disputes are separate from chat.`,
    keywords: ['open dispute', 'evidence', 'photos', 'timeline', 'trade'],
  },
  {
    id: 'disp-refund',
    sectionId: 'disputes',
    title: 'Request a cancel or refund',
    summary: 'Buyer cancel/refund (and live return) requests from order detail.',
    body: `Use the Cancel & refund panel on order detail when it appears.

Marketplace (Buy Now / offer):
• Request cancel before the seller ships or creates a Get Vaulted label.
• The seller approves or declines. On approval, you receive a full refund of the amount charged (item + shipping + tax).
• Cancel is blocked once a Get Vaulted label exists or the package has shipped.

Live show (Vault Events):
• Cancel before ship, or request a return within 2 days of delivery confirmation for a shipping defect (photos may be required).

On web:
1. My Account → Orders → order detail.
2. Open Cancel & refund and submit your request.
3. Seller approves, denies, or messages you.

On mobile:
1. Buyer order detail → Cancel & refund section when available.
2. Follow prompts matching web policy.

If approved:
• Refund returns to original payment method per Stripe timing.

If denied:
• Read the seller's reason.
• Escalate to Get Vaulted support from the refund panel if you disagree and have evidence.`,
    keywords: ['refund request', 'return', 'cancel', 'seller deny', 'live show', 'marketplace'],
  },
  {
    id: 'disp-escalate',
    sectionId: 'disputes',
    title: 'Escalate to Get Vaulted support',
    summary: 'After refund denial or urgent platform issues.',
    body: `Escalation sends your case to Get Vaulted support with order context.

When to escalate:
• Refund request denied and you have strong evidence (tracking, photos, misrepresentation).
• Payment charged twice or checkout error with bank charge.
• Safety issue in live chat or marketplace.

How to escalate:
• Web: Refund panel → Escalate to support (includes order ID).
• Mobile: Contact Support with category Order issue and paste order ID in reference field.

Include in your message:
• Order or trade ID
• Account email
• Short factual summary and what resolution you need
• Screenshots or tracking links

Response time is typically 1–2 business days by email at support@shopgetvaulted.com.`,
    keywords: ['escalate', 'support', 'denied refund'],
  },

  // ─── Account ──────────────────────────────────────────────────────────────
  {
    id: 'acct-signup',
    sectionId: 'account',
    title: 'Sign up and sign in',
    summary: 'Email, Apple Sign In, Google Sign In, and username.',
    body: `Create a free Get Vaulted account to buy, sell, trade, and join live shows.

Sign up:
1. Download the app or visit the website and tap Sign up.
2. Choose email/password or Continue with Apple / Google.
3. Pick a unique username — follow username rules (length, characters, no impersonation).
4. Verify email if prompted.

Sign in issues:
• Password reset: use Forgot password on login screen.
• Apple/Google: ensure you use the same provider each time — linking may differ from email signup.
• Locked out: Contact Support with account email.

Guests:
• Can browse some content; wallet, checkout, bidding, and selling require sign-in.`,
    keywords: ['sign up', 'login', 'apple', 'google', 'password'],
  },
  {
    id: 'acct-profile',
    sectionId: 'account',
    title: 'Edit your profile',
    summary: 'Username, bio, avatar, and public storefront.',
    body: `Your public profile is what other collectors see when they tap your username.

Edit profile:
1. Settings → View Profile, or open your profile from Account Hub.
2. Update display name, bio, avatar photo, and storefront highlights as available.
3. Save changes — username changes may be limited or rate-limited for abuse prevention.

Public vs private:
• Email and payment info are never shown publicly.
• Orders and wallet are private to your account.

Sellers:
• Profile links from listings and live rooms — keep branding professional and accurate.`,
    keywords: ['profile', 'username', 'avatar', 'bio'],
  },
  {
    id: 'acct-notifications',
    sectionId: 'account',
    title: 'Notification settings',
    summary: 'Push, in-app inbox, and activity alerts.',
    body: `Control how Get Vaulted notifies you about trades, orders, live events, and social activity.

Push notifications (mobile):
1. Settings → Enable push notifications.
2. Accept OS permission prompt.
3. Adjust device settings if notifications stop arriving.

In-app inbox:
• Settings → Notifications for follows, trade updates, order events, and platform messages.

Email:
• Transactional emails (receipts, security) send to your account email — keep it current under Settings → Change email.

Troubleshooting:
• iOS/Android: check system notification permissions for Get Vaulted.
• Log out/in after enabling push if token registration failed.`,
    keywords: ['notifications', 'push', 'inbox', 'alerts'],
  },
  {
    id: 'acct-delete',
    sectionId: 'account',
    title: 'Delete your account',
    summary: 'Permanent deletion rules and blocking conditions.',
    body: `Account deletion removes your profile and personal data per privacy policy.

Before deleting:
• Complete or cancel open trades.
• Resolve open disputes.
• Withdraw seller balance if you are a seller.
• Download any records you need — deletion is permanent.

Delete on mobile/web:
1. Settings → Account → Delete account (or Account deletion page on web).
2. Confirm identity step as prompted.
3. Acknowledge permanence and submit.

Deletion may be blocked while:
• Active trades exist
• Open disputes or chargebacks are in progress
• Seller payouts are pending reconciliation

Questions before deleting? Email support@shopgetvaulted.com.`,
    keywords: ['delete account', 'close account', 'privacy'],
  },

  // ─── Trust & Safety ───────────────────────────────────────────────────────
  {
    id: 'trust-verified',
    sectionId: 'trust',
    title: 'Vault Verified and seller trust signals',
    summary: 'What our badges and seller stats mean — and don\u2019t mean.',
    body: `Trust signals help you evaluate sellers, but read them for what they actually are:

Vault Verified / Vault Pick:
• "Vault Verified" reflects a seller's account standing and payout history, not an inspection of any specific item.
• "Vault Pick" is a seller-applied featured flag, not an authentication.
• Get Vaulted does not currently run a per-item authentication program.

Grading:
• PSA/BGS/SGC claims come from the seller — match the grade and cert number to what's shown in photos.
• Report mismatches immediately after delivery.

Seller profile stats:
• Completed sales shown on a seller's profile reflect real orders placed on Get Vaulted.
• We do not currently have a star-rating or written-review system — see "Seller ratings and reviews" for what's available today.
• New sellers aren't automatically untrustworthy — review listings and seller history carefully.

Authentication disputes require evidence — keep unboxing photos for high-value cards.`,
    keywords: ['verified', 'trust', 'authentication', 'grading'],
  },
  {
    id: 'trust-reviews',
    sectionId: 'trust',
    title: 'Seller ratings and reviews',
    summary: 'What buyer feedback tools exist today.',
    body: `Get Vaulted does not currently have a star-rating or written-review system on seller profiles or listings.

What's available today:
• A seller's profile shows their real completed-order count on Get Vaulted and their account standing/tier.
• If you have a problem with a seller or an order, use Report (for policy violations, fraud, or misconduct) or the refund/dispute tools (for order problems) — see the Disputes section.
• Fake, retaliatory, or extorted reviews are prohibited under our Community Guidelines wherever review or feedback features do exist in-product.

We may add a structured buyer-review feature in the future; this article will be updated if and when that happens.`,
    keywords: ['review', 'rating', 'feedback', 'seller'],
  },
  {
    id: 'trust-report',
    sectionId: 'trust',
    title: 'Report a user or listing',
    summary: 'In-app reporting for policy violations, fraud, and live show issues.',
    body: `Report content or behavior that violates Community Guidelines or our Terms of Service. You must be signed in. False reports may affect your account.

Report reasons available in-app:
• Harassment
• Counterfeit / fake item
• Scam / fraud
• Spam
• Inappropriate content
• Fake bids / shill bidding
• Seller misconduct
• Buyer misconduct
• IP / copyright violation
• Other (add details)

Where to report on mobile:
1. User profile → Report.
2. Listing / product detail → Report.
3. Live room → Report show for room-wide issues.
4. Live chat → tap username or message → Report.
5. Order detail → Report order issue.

Where to report on web:
• Profile, listing, live player, chat user menu, or order detail → Report.

When to report vs other help:
• Shipping delay or wrong item: try refund request or seller message first.
• Fraud, counterfeits, harassment, or off-platform payment requests: report immediately with order/listing IDs and photos in the details field.

Off-platform payments:
Never pay outside Get Vaulted checkout or live wallet. Report Scam / fraud if a user asks for PayPal, Venmo, wire, or crypto.

After you report:
Our trust team reviews and may remove content, suspend accounts, or ban users from live rooms. You may not receive outcome details when privacy rules apply.

Emergencies:
If someone is in immediate danger, call local emergency services first (911 in the U.S.), then email support@shopgetvaulted.com with subject URGENT SAFETY.

Read the full Reporting & Safety policy in Settings → Reporting & Safety (links to web) or Help Center on shopgetvaulted.com/reporting-safety.`,
    keywords: ['report', 'scam', 'abuse', 'violation', 'safety', 'fraud'],
  },
  {
    id: 'trust-guidelines',
    sectionId: 'trust',
    title: 'Community Guidelines',
    summary: 'Rules for buyers, sellers, hosts, and live conduct on Get Vaulted.',
    body: `Community Guidelines define acceptable behavior for everyone on Get Vaulted — buyers, sellers, hosts, and moderators. They work together with our Terms of Service.

Be respectful:
• No harassment, hate speech, threats, doxing, spam, or impersonation.
• Keep live chat and messages appropriate for a public marketplace.

Buy honestly:
• Bid and buy only when you intend to pay; keep Vault Wallet ready in live rooms.
• Use accurate shipping info; do not abuse chargebacks or disputes.
• Never request off-platform payment.

Sell and list honestly:
• Authentic items with accurate photos, condition, and grading claims.
• Ship on time using platform labels when provided.
• Do not ship layaway until paid in full.
• Full seller rules: Terms of Service → Seller Responsibility.

Live shows and breaks:
• Disclose PYT, PYD, random spots, Cards/Helmets format, and pricing before selling.
• No false guaranteed-hit claims; honor sold spots and live wins.
• Breaks involve disclosed risk — low-value outcomes are not fraud when rules were clear.

Auctions, trades, layaway:
• No shill bidding or manipulation.
• Honor accepted trades and layaway reservations.
• No off-platform deals to evade fees.

Payments:
• Use Get Vaulted checkout and live wallet only unless we authorize otherwise in writing.

Prohibited:
• Counterfeits, stolen goods, illegal items, scams, hate, sexual content involving minors.

Enforcement:
Warnings, content removal, live bans, payout holds, suspension, or permanent removal depending on severity.

Report violations from profiles, listings, live rooms, chat, or orders. See Reporting & Safety in Settings or shopgetvaulted.com/reporting-safety.

Full guidelines: Settings → Community Guidelines (mobile) or /community-guidelines (web).`,
    keywords: ['guidelines', 'rules', 'community', 'policy', 'conduct'],
  },
  {
    id: 'trust-block',
    sectionId: 'trust',
    title: 'Block and follow users',
    summary: 'Curate your network and hide unwanted interactions.',
    body: `Social tools help you control who you interact with.

Follow:
• Tap Follow on a profile to see their listings and live activity in your feed/notifications.

Block:
• Profile or chat user menu → Block.
• Blocked users cannot message you and may not see your activity depending on feature rules.

Unblock:
• Manage blocked users from privacy/settings when listed.

Block is personal curation — use Report for policy violations that harm others.`,
    keywords: ['block', 'follow', 'mute', 'network'],
  },
];

export function getHelpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}

export function getHelpArticlesForSection(sectionId: HelpSectionId): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.sectionId === sectionId);
}

export function searchHelpArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_ARTICLES;
  return HELP_ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.body.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.includes(q)),
  );
}
