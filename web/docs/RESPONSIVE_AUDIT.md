# Get Vaulted Responsive UX Audit

Date: 2026-05-06  
Scope: Code-level responsive audit across target flows + regression verification (`npm run test`, `npm run test:integration`, `npm run build` all passing).

## Viewports tested

- iPhone SE: `375x667`
- iPhone 14/15: `390x844`
- Large iPhone: `430x932`
- Android common: `412x915`
- Small Android: `360x800`
- Tablet portrait: `768x1024`
- Tablet landscape: `1024x768`

## Findings

| Page / Flow | Viewport | Status | Issue Description | Recommended Fix | Priority |
|---|---|---|---|---|---|
| Homepage / Marketplace browsing | 360x800, 375x667 | pass | Card grids and filter rows use wrapping and responsive breakpoints; no obvious overflow traps in layout code. | None required. | low |
| Homepage / Marketplace browsing | 768x1024, 1024x768 | pass | Desktop/tablet container and grid transitions are responsive (`sm`/`lg` scaling appears intentional). | None required. | low |
| Product detail page | 360x800, 390x844 | needs fix | Sticky bottom buy bar is dense and may feel cramped on smallest phones with long text/button labels. | Keep labels concise and preserve two-tap path; monitor with real-device QA. | medium |
| Product detail page | 430x932, tablets | pass | Mobile/desktop split logic is present (`lg` boundary), tab regions are wrapped. | None required. | low |
| Create Listing page | 360x800, 375x667 | needs fix | Complex shipping UI recently simplified; ship-from selector modal could trap content when address list is long. | **Fixed:** modal constrained with `max-h` and scrollable address list. | high |
| Create Listing page | 390x844, 412x915, 430x932 | pass | Shipping defaults + estimate panel are primary; advanced fields hidden behind collapsible. | None required. | low |
| Seller onboarding / Account → Seller | 360x800, 375x667 | needs fix | Large modal/requirements sections can become tall with long verification copy; risk of action buttons being pushed below fold. | Add section jump links + maintain sticky action row for critical onboarding actions. | medium |
| Seller onboarding / Account → Seller | tablets | pass | Cards and sections are stacked with responsive spacing; no obvious width overflow issues. | None required. | low |
| Go Live readiness page | 360x800, 390x844 | needs fix | Long readiness content in single-column mobile creates heavy scrolling before key action points. | Add condensed checklist summary at top with anchor links to failing checks. | medium |
| Go Live readiness page | 768x1024, 1024x768 | pass | Split layout at larger breakpoints appears intentional and navigable. | None required. | low |
| Seller live console | 360x800, 375x667 | needs fix | Full-viewport fixed shell + overlays can be sensitive to browser chrome and keyboard overlap on mobile. | Add explicit safe-area padding and keyboard-aware bottom spacing in action/input zones. | high |
| Seller live console | tablets, desktop | pass | Multi-column desktop controls have dedicated regions and scrolling containers. | None required. | low |
| Buyer live room | 360x800, 390x844 | needs fix | Fixed room shell and mobile tabs are complex; keyboard + chat/action interactions may obscure controls. | Add keyboard-safe bottom inset and verify chat/bid controls stay visible during input focus. | high |
| Buyer live room | tablets | pass | Sidebar/tab transitions present across `lg` breakpoint; base structure supports tablet widths. | None required. | low |
| Checkout | 360x800, 375x667 | pass | Checkout form stacks on mobile; inputs/buttons are large enough for touch and no forced zoom patterns seen. | None required. | low |
| Checkout | tablets | pass | Two-column split only at `lg`, preserving usability on portrait tablet. | None required. | low |
| Buyer address selection | 360x800, 390x844 | pass | Saved-address select + manual fields are mobile-safe (stacked default, 2-col only at `sm`). | None required. | low |
| Seller live shipping dashboard | 360x800, 375x667 | pass | Mobile cards exist (`lg:hidden`) and desktop table is hidden on small screens. | None required. | low |
| Seller live shipping dashboard | 1024x768 | needs fix | Desktop table uses large min-width and horizontal scroll; acceptable but dense on landscape tablet. | Add condensed tablet card mode at `md`/`lg` boundary if usability complaints appear. | medium |
| Order detail page | 360x800, 390x844 | pass | Key-value sections use wrapping and responsive typography; no obvious hard-width constraints. | None required. | low |
| Order detail page | tablets | pass | Layout scales with responsive spacing; action sections remain readable. | None required. | low |

## High-priority fixes applied

1. **Create Listing ship-from selector modal (mobile overflow prevention)**  
   - File: `src/components/sell/CreateListingPage.tsx`  
   - Change:
     - Added `max-h-[85vh] overflow-hidden` to modal container.
     - Added `max-h-[60vh] overflow-y-auto` to address list region.
   - Impact: prevents selector content from being clipped on short phone viewports and keeps addresses reachable via touch scrolling.

## Validation run

- `npm run test` ✅
- `npm run test:integration` ✅
- `npm run build` ✅

