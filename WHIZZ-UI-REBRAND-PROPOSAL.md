# WHIZZ SMS — Complete Visual Theme / UI Rebrand — Design Proposal
**Status:** PROPOSAL — awaiting your approval. **No code has been changed.**
**Baseline recorded:** fresh sandbox → `npm install` → server on `:4000` → regression **116/116 pass**, all 8 routes 200 (`/login /admin /manager /agent /client /management /panel-sharing /payment`).
**Reference screenshots:** NOT yet received (`/home/user/uploads/` currently contains only `README.md`). All colors/geometry below are concrete defaults; anything marked **[SC]** is tunable once you send the Lamix SMS / Galaxy screenshots.

---

## 0. Verified current-state model (from code inspection, not guessing)

### 0.1 Theme cascade — what actually renders today
Every panel page loads **5+ competing style layers**:

```
page inline <style> blocks (26–66 KB, 413–1078 !important each)
  → assets/galaxy.css        (dark base, 448 lines)
  → assets/galaxy-light.css  (dark-light variant, gated on body.gx-light — INACTIVE)
  → assets/whizz.css         (scoped html.whizz / body.whizz, 1349 lines, ALWAYS last)
```

Per-declaration cascade analysis (CSS parser, correct per-selector-part specificity, all viewports 390/768/1024/1440 px) proves:

> **whizz.css wins every property it targets on every page.** body.whizz `.X` (or `body.whizz .child .X`) beats every inline `.X` and every galaxy.css rule except the two defects listed in §3.

The panel you see today = whizz.css theme (white cards, navy `#12395C` sidebar, `#F4F6F8` background, blue `#1F6FA8` accents). The ~57–66 KB of inline dark/gold/black "galaxy/powerx" CSS in each page are dead weight that lose the cascade or contradict themselves (e.g. `.card` gets 4 competing backgrounds from one inline block; document order resolves it, whizz.css beats all).

**Therefore this rebrand = one source of truth (whizz.css) + gap closure + polish + strip dead layers.** No layout rewrites are required, and zero functional change is possible/needed.

### 0.2 Real defects found (fix list §3)
| # | Defect | Evidence |
|---|--------|----------|
| D1 | Chart bars keep galaxy **rainbow gradients**, not theme blue | `galaxy.css L180–186` `.chart .bar-col:nth-child(n) .bar` spec (0,3,1)+imp **> whizz.css L871** (0,2,0)+imp |
| D2 | `--wz-blue-dk`, `--wz-text-3`, `--wz-sub-h` are **used but never defined** (login hover/captions fall back unpredictably) | token audit: 38 used, 81 defined, these 3 missing |
| D3 | `.gx-amber` renders **dark-theme amber on white cards** (status buttons on manager/management/admin/agent) | galaxy.css-only style: `color:#ffc94d; background:rgba(251,191,36,.1)` |
| D4 | 15 classes genuinely unstyled / styled only by losing dark layers | `.gx-dash-sub, .gx-num, .gx-copy-num-btn, .gx-gb-lab, .gx-num-page-badge, .gx-numbers-count-badge, .gx-tot, .gx-nav-lock, .si-blue, .log-tab, .numChk, .last-sms, .dashboard-recent, .btn-sm` |
| D5 | Hardcoded inline `style="…color:#hex"` in markup **+ JS templates** — survives every CSS override | markup: admin 28, manager 16, agent 29, client 4, mgmt 25, panel-sharing 62; JS templates: admin 25, manager 9, agent 9, client 2, mgmt 17, panel-sharing 22 |
| D6 | Manager active-navtab gold bottom border (`#D4AF37`) inside converted-sidebar block | `manager.html L364 + L86` |
| D7 | 17 whizz.css selectors have no target ever rendered (dead CSS: `.wz-balance(s)`, `.gx-nav-badge`, `.sd-display`) | verified against markup + jsdom-free GQL of galaxy.js/whizz-ui.js |
| D8 | Fonts declared (`Inter`, `Plus Jakarta Sans`, `JetBrains Mono`) but **no @font-face / webfont** → system-font fallback, inconsistent rendering | 0 @font-face rules repo-wide |
| D9 | `body.ms-dark-mode` toggle in api.js has **zero CSS rules** (broken Theme button); galaxy.js `gx-light` toggle conflicts visually (un-themed edge states) | api.js L452+ vs 0 rules |
| D10 | Manager/appbar `.who`-chip vs topbar `.avatar` inconsistency across panels (4×`.av`, 1×`.avatar`) | markup audit |

### 0.3 Shell inventory (structure is GOOD — all responsive drawers already exist)
| Page | Shell | Desktop nav | Mobile nav (@≤900px) |
|------|-------|------------|----------------------|
| admin.html | `.layout > aside#sidebar .sidebar + .main > .topbar + .content > section#page-*` | fixed 260px sidebar | hamburger → `translateX(-100%↔0)` + `#overlay` |
| management.html | same as admin | same | same |
| test.html | same as admin | same | same |
| client.html | same (+ `.tb1` inner row) | same | hamburger → `#sbOverlay` |
| manager.html | `.appbar` (converted to fixed sidebar @901px) + `header.mgr-topbar` + `nav#navtabs.navtabs` | sidebar-converted appbar | `.mgr-topbar` sticky + drawer `#mgrMobileOverlay` |
| agent.html | `.rail` icon rail 76px → 238px hover | icon rail | `toggleRail()` → `.rail.show` ×8 hooks |
| panel-sharing.html / payment.html | `.layout > aside.side + main.main > .top + .content` | navy side rail | same drawer pattern |
| login + 4 sub-logins | `.wz-login-shell > .wz-login-card` (centered card, all breakpoints) | — | — |

### 0.4 What is generated at runtime (re-skin, don't rebuild)
| Widget | Source | Current styling |
|--------|--------|-----------------|
| Sidebar search-select dropdowns (`sd-*`) | `galaxy.js` MutationObserver → creates `.sd-wrap/.sd-menu/.sd-option…` | whizz.css has full §, verified live |
| Pagination | `api.js drawServerPagination()` → `.pagination` in `.table-foot` | whizz.css L483–492 wins |
| Toast notifications | `api.js showToast()` → `.ms-toast` | whizz.css wins |
| Topbar Theme btn | `galaxy.js GX.theme` → `.gx-theme-btn` | whizz.css §17 pinned design |
| Settings/profile/activity modals | `api.js` `msSettingsPanel`, `msProfileMenu/Modal` (hardcoded #fff inline) | CSS can only partially override (#fff inline styles) |
| Legal gate | `api.js gxLegalGate` | whizz.css §14 re-skinned ✓ |
| Client welcome overlay, agent onboarding | inline per page | whizz.css §16 ✓ |
| Stat dashboard cards | inline JS `gxDashCards.map(...)` → `.stat-card.dash-metric.d-blue…` | whizz beats galaxy nth-child gradients with (0,4,1)+imp |
| Charts | inline `buildBarChart()` div bars | **D1 — galaxy rainbow wins** |

---

## A. GLOBAL THEME

**SCREEN:** All 12 front-end pages.
**Current:** whizz.css is a mature token system (`--wz-*` + legacy alias remap). Palette already = white/light-gray base, blue accents. Weaknesses: 3 undefined tokens, navy `#12395C` sidebar reads slightly dusty, shadows/radii conservative (6/8px), no typography scale, font stack has no webfont, 838–1078 `!important` per inline block fight it.
**Proposed:** keep the token architecture and class strategy (scoped `body.whizz`), modernize values. Single source of truth in `assets/whizz.css`; strip dead layers from pages (§A.3).

### Colors **[SC]** — token table (CURRENT → PROPOSED)

| Token | Current | Proposed |
|-------|---------|----------|
| base bg `--wz-bg` | `#F4F6F8` | `#F5F7FA` (cooler, cleaner) |
| card `--wz-card` | `#FFFFFF` | `#FFFFFF` ✓ keep |
| primary `--wz-blue` | `#1F6FA8` | `#1F6FA8` ✓ keep (WHIZZ brand) — hover `--wz-blue-dk` **define** `#185A88` |
| soft blue tint `--wz-blue-soft` | `#E8F1F8` | `#EAF3FA` |
| accent line `--wz-blue-line` | `#BBD5E8` | `#C4DCED` |
| sidebar `--wz-nav → -2` | `#12395C → #0E2E4A` | `#0F3056 → #0B2547` (deeper, sharper contrast) |
| sidebar active `--wz-nav-active` | `#1B5480` | `#1B5A88` + 3px right edge indicator `#4FC3F7`-tint? → keep brand-quiet: `rgba(255,255,255,.06)` rail + blue left bar (already `::before` L226) |
| sidebar text `--wz-nav-text/-dim` | `#D6E2EC / #93AEC4` | `#DCE7F0 / #93AECC` |
| text `--wz-text/-2/-3` | `#22303F/#42546A/(undefined!)` | `#1F2A37/#40546A/#6B7A8C` (define `--wz-text-3`) |
| lines `--wz-line/-2` | `#D7DCE3/#E5E9EF` | `#DDE3EA/#E8ECF2` |
| zebra/hover | `#FAFBFC/#F0F6FB` | `#FAFBFD/#EFF6FC` |
| head `--wz-head → -2` | `#EDEFF2 → #DCE0E6` | flat `#F2F5F8` (kill gradient — cleaner/cleaner) |
| status green | `#5CB85C/#479A47` | `#3FAB63/#2F8F4E` (slightly modern green) **[SC]** |
| status red | `#D9534F/#BF423E` | `#E1554F/#C9453F` |
| status amber/gold | `#E8862A, #F7C948` | `#F59E0B` family; **gx-amber → light amber chip** (fix D3) |
| focus ring | `rgba(31,111,168,.18)` | keep |

**Layout (geometry tokens):** radii `6/8px → 8/12px` (cards 12, tables 10, buttons 8) **[SC]**; shadows deepen one notch: `--wz-shadow: 0 1px 3px rgba(16,32,52,.06), 0 4px 14px rgba(16,32,52,.05)`; card padding 16px→18px; table cell padding 9px→10px.

**Typography:** keep system stack (`Inter` → `Segoe UI` → system) — no webfont (offline-safe); establish scale: page title 17px/650 · section `.card-head` 13px/600 · body 13.5px · table 12.5px · captions `--wz-muted` 12px · mono (`JetBrains Mono`→Consolas) 12px for OTP/CLI/number columns. Fix `text-transform` leftovers on `.navtab` (done L1297, keep).

**Sidebar/Header (all panels):** navy sidebar, white 3px border separators between logical groups, active item = blue fill + left accent bar; topbar = white bg, 1px bottom border, right-aligned icon buttons 34px, `.Live` chip green-tinted.

**Tables:** flat header band, `A-Z sortable` arrows unchanged, zebra off-white, row hover `--wz-hover`, money columns `.cell-money` green tabular-nums, `.payout-rate` orange, `.otp` blue bold, checkbox `.numChk` 15px blue accent (fix D4).

**Buttons (unified set):** `.btn` = white/blue-border ghost **default**; `.btn-blue` filled brand; `.btn-red` danger; `.btn-green` success; `.btn-ghost` text-only; `.btn-purple/.btn-teal/.btn-rose/.btn-amber` remapped to brand family (blue tones + one violet retained for range actions, amber for warn) **[SC]**; `.btn-sm` (fix D4) 28px height/11px font; `.gx-btn` family = white-chip action buttons w/ colored icon (green/amber/red variants styled light, fix D3); icon-only `.icon-btn` 30px square ghost.

**Forms/inputs:** height 38px, radius 8px, border `--wz-line-2`, focus = blue border + 3px ring; labels 12px/600 `--wz-text-2`; `.field` gap 15px; inline validation msg `.hint` muted; disabled `not-allowed` + 60% opacity (exists, keep).

**Feedback:** `.ms-toast` top-right, white card + colored left bar (green/red), 260px, auto-dismiss (JS unchanged); empty states: currently ad-hoc `<td colspan>` — restyle via CSS: centered, muted, 2-line ("No data yet" + hint) *without DOM change* (`:only-child td[colspan]` pattern); loading: `buildBarChart` keeps 0-state; add CSS `.loading`-style spin only where class already exists (`.info`), **no new JS**.

**Responsive:** keep §12 breakpoints (1200/1024/900/768/480); add CSS-only refinements per §J.

**VISUAL/THEME CHANGE (A):** everything above.
**FUNCTIONAL CHANGE (A):** none. (Sidebar dropdown engine, toasts, pagination, modals — all behaviors untouched.)

### A.1 Sub-logins (management/panel-sharing/payment/test-login)
Identical `.wz-login-shell/.wz-login-card` shell; follow §B exactly (same CSS section covers them — one edit covers all five).

### A.2 public-request.html / set-password.html
Light-blue standalone pages, zero shared CSS, zero `!important`. Restyle tokens inline (self-contained) to match new palette (bg `#F5F7FA`, primary `#1F6FA8`, radius 8/12). No behavior change.

### A.3 Dead-layer strip (visual-file cleanup — REQUIRED for "one source of truth")
| Target | What | Visual delta |
|--------|------|--------------|
| `galaxy-dark-theme` inline blocks (admin 21.6KB/412imp; manager/agent/client/management same hash family) | delete or empty after visual A-B check | zero (verified: whizz wins all their properties; D1/D6 handled first via whizz §chart override) |
| `powerx-theme` inline on login/sub-logins (7.9KB) | delete (whizz §13 wins all its props — verified 0 losses) | zero |
| `powerx-module-theme` aurora blocks on panel-sharing/payment (4.1KB) | delete (whizz wins all) | zero |
| Unified-Clean/Hybrid-Black-Gold/WHIZZ-navy ghost blocks (admin L35→L376, 5 :root blocks) | delete | zero (all losing) |
| `assets/powerx-theme.css` / `powerx-login.css` / `powerx-*.png` | **leave on disk** (never linked already; file deletion beyond scope) | zero |
| `galaxy.css` / `galaxy-light.css` files | **do NOT delete** (runtime dependents: `GX.theme` toggle, `.gx-btn`, `.sd-*` hooks live there partially) — instead re-score: remove `:root dark` + rules that contradict whizz only if §J visual A-B passes | possible small deltas → A-B required |
| whizz.css dead rules (D7) | delete 17 rules | zero |

**Safety protocol for every strip:** before/after screenshots at 1440/768/390 for each panel + per-selector grep confirmation that every deleted losing rule never wins (script already built).

---

## B. LOGIN  (file: `login.html` + 4 sub-logins + whizz.css §13)

**SCREEN:** main `/login` (and 4 identical sub-logins).
**Current:** centered 390px white card on brushed-silver metallic gradient (`#E6EAEF → #D8DDE4 → #CFD5DD`), WHIZZ logo 56px, fields w/ left SVG icons, captcha row 118px+1fr, "Remember me" + forgot link, full-width blue submit `.btn`, status `.msg`, footer. Card radius 14px, soft triple shadow, wzFade entrance. All 5 logins share one shell; whizz.css beats every legacy inline rule (0 real losses — verified).
**Proposed (per your brief: modern centered mobile-style card; Lamix-inspired — final values [SC]):**

- **Background:** replace brushed-metal with clean light field: flat `#F0F4F9` + very subtle blue radial halo top (`radial-gradient(720px 360px at 50% -8%, rgba(31,111,168,.10), transparent 62%)`) — same structure, one comment block swap, no saturated color.
- **Card:** 390–400px, radius **16px**, padding 36/32/28, white `#FFF`, border `1px #E2E8F0`, shadow `0 24px 48px rgba(16,32,52,.10)` single-set.
- **Brand:** logo column 56→60px; under it eyebrow text (`WHIZZ SMS PANEL`, 11px, letterspaced, `--wz-blue`) + title 18px + subtitle `--wz-text-3` (define token — D2).
- **Inputs:** height 42px, radius 8px, icon 16px `--wz-text-3`, hover border `--wz-line`, focus blue + ring `.13a` (exists); password toggle blue 12px/600.
- **Captcha:** 118px box flat `#F7F9FA` (kill gradient), tabular-nums 15px/650, refresh icon-button blue ghost.
- **Remember/Forgot row:** 12.5px; forgot link blue hover underline-offset.
- **Submit:** full width, 42px, radius 8px, `--wz-blue`, hover `--wz-blue-dk` **(define — D2)**, active `translateY(1px)` (exists), focus-visible 2px offset ring.
- **Status `.msg`:** red/green soft-tint banners (exists, verify against new palette).
- **Footer:** 11.5px `--wz-text-3`.
- **Mobile (<520px):** card = full-bleed `min-height:100dvh` edge-to-edge (existing `@media(max-width:520px)` L345 radius:22px → adjust to 0 edges behaviour **[SC]**), no horizontal scroll ever (already true).

**VISUAL/THEME CHANGE (B):** §13 token/rule edits only.
**FUNCTIONAL CHANGE (B):** none (login JS, captcha math, rate-limit UX, error mapping untouched).
**Source files:** `assets/whizz.css` §13; no HTML edits (shell already correct).

---

## C. ADMIN PANEL (file: `admin.html`, 324KB/3532 lines, ~27 pages)

**SCREEN:** super-admin workspace (dashboard, ranges, numbers, allocation, self-allocate, providers, rates, reports, CDR, CLI, limits, exports, settings…).
**Current:** fixed navy sidebar w/ search-selects + grouped nav; white topbar (`Theme/Fullscreen/avatar-A/Settings/Logout` + `Live` chip); dashboard = JS-built `gxDashCards` stat cards + payout chips `gxPayRow` + provider-cost row + week/month `buildBarChart`; pages use `.toolbar + .filter-row + .table-wrap(tscroll) + .table-foot + .pagination`; 8 modals; 251 inline `style=` attrs (28 hardcoded colors) + 25 JS-template colors; dead ghost blocks 58289B/838imp.
**Proposed:**

- **Colors/Layout:** global §A. Content max-width none (fluid 18px→20px padding); `.dash-row` grid2 equal cards.
- **Sidebar:** apply global navy polish; search-select `.sd-*` already themed; brand row height 60px, mark `whizz-mark-light.png`, version chip `.sb-ver` keep.
- **Header:** white, 54px, title left (`.tb-title` 15px/650), right cluster 34px icon buttons, divider before Logout, avatar initial chip blue-soft.
- **Dashboard stat cards:** white, radius 12px, left 3px accent (`.d-blue/.d-green/.d-orange/.d-pink` → blue/green/orange/violet accent rail instead of full-color gradient), icon chip soft tint, value 22px/700 tabular-nums, label 12px muted, `::before/::after` blobs removed (already, L861) — **galaxy nth-child gradients dead**; payout chips `.gx-pay-chip` = white cards tinted icon.
- **Charts:** **fix D1** — single rule `body.whizz .chart .bar-col .bar { background: linear-gradient(180deg, #2B7FC1, #1F6FA8) !important; }` spec (0,3,1)+imp ties galaxy's; add `:nth-child(7)` beat via later doc order. Track `#EFF2F5`, value 11px/600 above bar.
- **Tables:** per §A; sticky thead (exists L444), money cells green/orange, `.mono` numbers, `.tag-agt/.tag-cli/.tag-mgr` role chips colored soft tints.
- **Buttons:** unified set per §A; `.btn-purple` alloc actions → violet soft-fill **[SC]**; danger `.btn-red` only where already used.
- **Forms/filters:** toolbar compact 38px inputs; `renderSearchSelect` dropdowns re-skinned (exists); `.filter-row` gap 10→12px.
- **Modals (8):** overlay `rgba(16,32,52,.45)` blur, white 12px card, radius 14, header band, footer button row right-aligned (all CSS via `.modal-box/.ms-modal` selectors — markup untouched).
- **Dead CSS:** strip ghost blocks per §A.3 (52 KB savings).
- **Responsive:** global §J.
- **Other:** `.gx-num-page-badge`, `.gx-copy-num-btn`, `.gx-gb-lab`, `.gx-tot`, `.btn-sm` styling (D4); JS hardcoded color cleanup (D5 — see §K policy).

**VISUAL/THEME CHANGE (C):** whizz.css rules + ghost block deletion + D5 color-token swap.
**FUNCTIONAL CHANGE (C):** none (all `onclick`, `loadX()`, `drawServerPagination`, `showPageByName` untouched).
**Source files:** `admin.html` (inline `<style>` deletion + inline `style=` color swaps ONLY), `assets/whizz.css`.

---

## D. MANAGER PANEL (file: `manager.html`, 202KB/1643 lines)

**SCREEN:** manager workspace (rate card, numbers, allocation, own stats, CLI, test).
**Current:** unique shell — `.appbar` horizontal top nav on desktop which inline CSS converts into a fixed left sidebar @≥901px (`min-width:901px` block, 4.4KB/80imp); `header.mgr-topbar` + hamburger for mobile; `.who` user chip; `navtabs` + `dropmenu`; rate-card grid w/ `.readonly-note`; `gxDashCards` + `gxPayRow` like admin; D6 gold border artifacts; 114 inline `style=` (16 colored) + 9 JS colors; dead CSS 66KB/1078imp.
**Proposed:**

- **Sidebar (converted appbar):** identical treatment to admin sidebar — navy bg, grouped nav, `.navtab` = row item 12px radius, active = blue fill + left bar; kill `.appbar .navtab.active{border-bottom-color:#D4AF37}` inline (D6) — visual delta: gold underline → clean (intended).
- **Header:** `.mgr-topbar` white; `.who` chip = avatar blue-soft + name/role stacked; Fullscreen/Logout icon buttons.
- **Dashboard:** identical stat-card + pay-chip + chart treatment as admin (shared rules — both use same classes).
- **Rate card tables:** `.rate-cell` orange tabular-nums, readonly note pill blue-soft, zebra rows; `gx-btn` action row = white chips.
- **Buttons:** `.btn-blue/.btn-teal/.btn-amber` → brand set; revenge of ghost defaults removed.
- **Forms:** numbers bulk-allocate `.form-grid` 2-col → 1-col @≤900px (exists), filters same as admin.
- **Dead CSS:** strip ghost blocks (66KB savings — biggest win); convert block stays (it IS the shell) but recolor inside whizz scope.
- **Responsive:** §J + keep `mgr-topbar` sticky; drawer `mgrMobileOverlay` dark-scrim (CSS only).

**VISUAL/THEME CHANGE (D):** as above.
**FUNCTIONAL CHANGE (D):** none (navtab click handlers, dropwrap menus, rate-card fetch/render untouched).
**Source files:** `manager.html` (ghost block deletion + D6 inline rule excision), `assets/whizz.css`.

---

## E. AGENT PANEL (file: `agent.html`, 205KB/2013 lines)

**SCREEN:** agent workspace (rate card, self-allocate, numbers, test, own CDR/stats).
**Current:** `.rail` icon-rail (76px, expands 238px on hover, tooltips); topbar w/ hamburger + `.tb-title` + `.clock`; dashboard uses the modern `.wz-tiles/.wz-strips/.wz-dash-main/.wz-metrics` component set (whizz §10) — only panel using it; `.dashboard-recent`/`.gx-nav-lock`/`.gx-numbers-count-badge`/`btn-sm` unstyled (D4); 143 inline `style=` (29 colored incl 6×`#86efac` success text) + 9 JS colors; 59KB/857imp ghost.
**Proposed:**

- **Rail:** navy, icon 20px, white 3px active indicator left, hover expand smooth (exists — keep width/timing), labels fade-in, tooltips dark-navy w/ white text (CSS only), mobile drawer show (exists).
- **Header:** white; `.tb-title` reflects page (JS unchanged); clock 12px muted tabular-nums.
- **Dashboard components (§10):** tiles = white 12px radius, icon chip soft-blue, strip cards tinted top border, metrics grid value/label — polish shadows/gaps per §A; `.dashboard-recent` gets proper card styling (D4).
- **Rate card:** same as manager.
- **Self-allocate:** `.card` header + `.table-wrap`; modal `.modal-box` re-skin; green success text `#86efac` inline → `.tag-green`/var(--wz-green-2) (D5).
- **Buttons:** `.btn-purple` self-allocate action → violet **[SC]**; `.btn-blue` primary; `.btn-sm` 28px.
- **Dead CSS:** strip ghost (59KB).
- **Responsive:** rail width 260 drawer @≤900 (exists); tiles 5→2→1 columns via §12 (exists) — verify gaps.

**VISUAL/THEME CHANGE (E):** as above.
**FUNCTIONAL CHANGE (E):** none (rail JS toggle, self-allocate alloc/remove flows, test-send untouched).
**Source files:** `agent.html` (ghost deletion + inline color swaps), `assets/whizz.css`.

---

## F. CLIENT PANEL (file: `client.html`, 102KB/759 lines)

**SCREEN:** client workspace (dashboard, numbers, own CDR/stats, test).
**Current:** admin-style shell + `.tb1` inner topbar row `.who` chip; welcome overlay (§16 debug-verified); `.last-sms` card inline-styled dark colors (`style="color:#E2E8F0"` D4/D5 — will read wrong on white); `.masknote` pill; `d-*` stat-cards + chart; `gx-numbers-count`; only 4 hardcoded colors (cleanest panel); 56.7KB/822imp ghost.
**Proposed:**

- **Sidebar/topbar:** global §A; `.who` chip like manager.
- **Dashboard:** stat-cards w/ accent rails; chart fix (D1); `.dashboard-recent` card (D4); `.last-sms` → proper `.card` theming: delete the 4 inline color attrs or replace w/ var(--wz-text) equivalents (D5).
- **Numbers page:** masked-number `.masknote` pill blue-soft; copy button `.gx-copy-num-btn` ghost icon chip (D4); page-count badge (D4).
- **Welcome overlay:** keep structure; re-skin card radius/shadow per §A; gold `b:first-child` circle fix already verified — colors → palette.
- **Dead CSS:** strip ghost (56.7KB).
- **Responsive:** §J; `#sbOverlay` scrim CSS-only.

**VISUAL/THEME CHANGE (F):** as above.
**FUNCTIONAL CHANGE (F):** none (welcome overlay flow, copy-to-clipboard, mask logic untouched).
**Source files:** `client.html` (ghost + 4 inline styles), `assets/whizz.css`.

---

## G. MANAGEMENT PANEL (file: `management.html`, 300KB/3306 lines, 21 pages)

*Secondary panel — **visual theme only**; no workflow changes (per your spec).*

**SCREEN:** operations workspace (import/test-import, carrier integration, system logs, provider & API-provider mgmt, SMPP connections, CLI limits, limit mgmt, backup…).
**Current:** admin-style shell; provider/SMPP status cards `.stat-card.dash-metric` + `.dot` indicators ×8; `.log-tab` tab-set ×4 **unstyled** (D4); `.si-blue` info chips inline-only; `.upload-box` dropzones; 11 modals (most in repo); 212 inline `style=` (25 colored) + 17 JS colors; 57.8KB/838imp ghost.
**Proposed:**

- **Shell/sidebar/topbar/buttons/tables:** apply global §A (whizz coverage is already near-complete — 25 gap-classes only, of which real: `.log-tab`, `.si-blue` → style).
- **Log tabs:** horizontal pill set — inactive ghost, active blue-soft fill + blue text, 10px radius (CSS vs `.log-tab`/`.log-tab.active`).
- **Status surfaces:** provider/SMPP cards use accent-rail stat-cards; `.dot` = green/red status dot (already — verify palette); disabled rows 55% opacity (exists).
- **Upload boxes:** light dashed border `--wz-line`, blue hover, icon+mtext muted (CSS only).
- **Modals:** same §A modal re-skin.
- **Dead CSS:** strip ghost (57.8KB).
- **Responsive:** §J.

**VISUAL/THEME CHANGE (G):** as above.
**FUNCTIONAL CHANGE (G):** **NONE** — provider/SMPP/carrier/backup forms, log fetchers, tab switching JS untouched.
**Source files:** `management.html` (ghost deletion), `assets/whizz.css`.

---

## H. PANEL SHARING (file: `panel-sharing.html`, 106.8KB/1725 lines)

*Secondary panel — **visual theme only.***

**SCREEN:** number-sharing workspace (numbers w/ per-row checkboxes, allocation, own CDR).
**Current:** compact module shell `.layout > aside.side + main.main`; navy `.side` w/ `.nav .item`; `.top` bar; `.navtab` strip; `.numChk` row checkboxes **unstyled** (D4); worst D5 in repo: 250 `style=` attrs, **62 hardcoded colors** (13×`color:#ef4444`, 3×`#3b82f6` fills, 2×`#22c55e`, rgba white/4% panels) + 22 JS-template colors — many honor `var(--px-*)` aliases already remapped by whizz, but hex literals do not.
**Proposed:**

- **Theme surfaces:** same `.side/.top/.box/.card/table/thead/.btn` rules as payment (shared §? — whizz treats them identically already, verified beats aurora/powerx blocks).
- **Checkboxes:** `.numChk` accent-color blue, 15px (D4).
- **Hardcoded colors:** swap hexes → `var(--wz-red)/(--wz-blue)/(--wz-green)` etc. (D5 — mechanical grep-verified replacement, markup text preserved).
- **Buttons:** 16 ghost/12 green/9 `.btn`/8 `.btn-blue`/7 red/3 `.btn-green` → unified set.
- **Dead CSS:** delete `powerx-module-theme` + anonymous purple + aurora blocks per §A.3 (28.4KB).
- **Responsive:** §J (drawer exists).

**VISUAL/THEME CHANGE (H):** as above.
**FUNCTIONAL CHANGE (H):** **NONE** — number selection/checbox logic, allocation save, CDR fetch untouched.
**Source files:** `panel-sharing.html` (ghost deletion + hex swaps), `assets/whizz.css`.

---

## I. PAYMENT PANEL (file: `payment.html`, 36KB/42 lines)

*Secondary panel — **visual theme only.***

**SCREEN:** payment workspace (payouts, rates, commissions, payment methods).
**Current:** same module shell as panel-sharing; dense inner `.navtab` secondary nav; content rendered near-entirely by JS into `.box` containers using var(--px-*) tokens (already aliased → on-brand); **zero hardcoded hex** — cleanest module; 28.3KB/510imp ghost blocks.
**Proposed:**

- **Theme:** same as §H — already 90% correct because whizz aliases remap every `--px-*` it uses. Small deltas: table head flat, payout figure `.money` orange tabular-nums, status chips light tints.
- **Navtab sub-strip:** inactive muted text-button, active blue text + 2px blue underline (kill var(--px-accent) bottom gold — actually resolves to blue already via alias; now expressed explicitly).
- **Dead CSS:** strip 28.3KB ghost (incl 21.8KB powerx-theme block, hash-identical to panel-sharing's).
- **Responsive:** §J.

**VISUAL/THEME CHANGE (I):** as above.
**FUNCTIONAL CHANGE (I):** **NONE** — payout calcs/exports/affiliate rates untouched.
**Source files:** `payment.html` (ghost deletion), `assets/whizz.css`.

---

## J. RESPONSIVE / MOBILE (all panels) **[SC on restyle values]**

**Current:** breakpoints 1200/1024/900/768/480; drawers exist everywhere; manager `.mgr-topbar` sticky; agent rail drawer; tables scroll horizontally in `.tscroll`; tiles/metrics stacks handled.
**Proposed (CSS-only):**

1. `<900px`: sidebar/rail/side drawers open 260px, scrim `rgba(16,32,52,.35)` 220ms fade (exists — restyle color), body-scroll lock already.
2. `<768px`: `.content` padding 14px; page-head stacks; toolbar/filter rows wrap w/ 8px gap; stat-cards grid → 2-col (`stats-grid`), 1-col `<560px`.
3. Tables: `.tscroll` `-webkit-overflow-scrolling:touch` + 12px row padding; **optional** sticky first col for wide CDR tables `[SC]` (pure CSS `position:sticky` on `td/th:first-child` — DOM untouched).
4. `<480px`: topbar title ellipsis; icon buttons 32px; modals full-bleed with safe-area padding; `.btn` min-height 40px touch targets.
5. `prefers-reduced-motion` honored (exists — keep).
6. No DOM/JS changes anywhere in this section.

**VISUAL/THEME CHANGE (J):** 1–6.
**FUNCTIONAL CHANGE (J):** none.

---

## K. Policy for JS/markup hardcoded colors (D5 — needs your explicit OK per category)

Inline `style="…color:#hex"` **always beats** external CSS (even whizz `!important` loses to inline styles UNLESS the inline value is absent). Options per category:

| Category | Count | Proposed fix | Risk |
|----------|-------|--------------|------|
| K1 Static markup attrs | 165 (28+16+29+4+25+62+0) | replace hex with `var(--wz-*)` token in place | none (same element/style text; color value only) |
| K2 JS template literals (status/red/green/amber fills) | 91 (25+9+9+2+17+22+0) | replace hex with `var(--wz-*)` in the template string | none visual-negative; grep-verified |
| K3 api.js runtime widgets w/ hardcoded `#fff` (msProfileModal/Menu) | 3 spots | CSS-only: leave #fff (white = on-theme today) OR add selectors. No JS edit needed under the light theme. [] **leave as-is** | none |
| K4 Conditional semantic colors (e.g. `#4ade80`/`#f87c8a` positive/negative chips) | ~30 | map to `--wz-green-2`/`--wz-red` to stay semantic | none |

**These are visual-string edits, not logic edits.** I will treat them as covered by your "visual/theme only" scope if you check the box; otherwise I leave hexes where they still look acceptable and fix only the glaring ones (agent `#86efac`, client `.last-sms`, panel-sharing rgba-washes).

---

## L. Implementation & verification plan (post-approval)

Order (each step independently restarts server, screenshots, and runs suites before moving on):

1. **whizz.css**: define 3 missing tokens; §chart override (D1); add 15 gap-class rules (D3/D4); §polish (radius/shadow/table/form); fix `--wz-text-3` consumers; delete 17 dead rules.
2. Visual A-B: 8 pages × 3 viewports screenshot diff (playwright-less: headless chromium if available, else CSS-comp DOM sampler).
3. **login.html** §13 restyle + sub-login parity check (5 pages).
4. **Strip pass** per §A.3 per page (admin → manager → agent → client → management → sharing → payment), each followed by A-B + full suite.
5. **K1/K2** hex→var swaps (if approved), each grep-verified.
6. **Responsive pass** §J.
7. Final: `whizz-phase2-verify` (must stay **116/116**) + manual UI checklist (all 8 pages, every tab/modal, mobile 390/768) + API behavior spot-checks (login, SMS ingest, ranges, rates, CDR, payout endpoints — behavior identical by construction).
8. Deliver report: files changed / visual changes / functional changes (expect: **NONE**) / tests / issues.

**Files to be modified (visual only):** `assets/whizz.css`, `login.html`, `admin.html`, `manager.html`, `agent.html`, `client.html`, `management.html`, `panel-sharing.html`, `payment.html`, `public-request.html`, `set-password.html`, 4 sub-login pages (CSS-section edits only).
**Files explicitly NOT touched:** `backend/**`, `api.js`, `assets/galaxy.js`, `assets/whizz-ui.js`, `assets/galaxy.css`/`galaxy-light.css` files themselves (unless §A.3 A-B says specific rules are provably dead), all routes, all DB code.

---

## M. Approval checklist — tick what you approve

- [ ] **A** Global token restyle (palette shifts, radius 8/12, shadows, typography scale)
- [ ] **B** Login restyle (pending your Lamix screenshot — approve direction now, final values after screenshot)
- [ ] **C/D/E/F** Role-panel polish (cards accent rails, unified buttons, modals, badges) + ghost-CSS strip
- [ ] **G/H/I** Secondary panels theme-only + ghost-CSS strip
- [ ] **J** Responsive CSS refinements (incl. optional sticky first table column? Y/N)
- [ ] **K1** markup hex→var (165 spots)
- [ ] **K2** JS hex→var (91 spots)
- [ ] Strip `galaxy-dark-theme`/`powerx-theme` inline blocks (provably dead) — Y/N per file? (default: all)
- [ ] Send Lamix/Galaxy screenshots → I adjust any **[SC]** values and show you the delta before implementing

**After your tick-list + screenshots, I implement in the L.1–L.8 order and report in your standard template.**
