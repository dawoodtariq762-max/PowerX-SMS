# WHIZZ SMS — Cleanup, Login URL & Rate Configuration Report

Date: 2026-09-28 · Verified locally (no VPS touched) · Regression: **116/116 PASS**

---

```
=== Login ===
Old path:            /panel-login
New path:            /login
Legacy redirect:     YES (301 permanent — /panel-login, /panel-login.html and /login.html all → /login; "/" → 302 /login)
Login tested:        PASS (all 5 roles: admin/manager/agent/client/test — login → /api/me → logout → re-login)
Logout tested:       PASS (session destroyed; authed /api/me → 401; panels redirect to /login)

=== Cleanup ===
Mobile app removed:             YES (mobile-app/ deleted; zero web/backend/build references)
Discontinued features removed:  YES (chat widget duplicate, old AI assistant remnants, file-picker docs — inventory first, deletions verified)
Bench toolkit removed:          NO — kept intentionally (bench-toolkit/ + scripts/bench-*.js target the CURRENT backend; useful capacity tools)
Tests kept:                     30 (9 deleted only after confirming they target removed features; 3 surgically edited, not deleted)
Preserved:                      YES (all existing functionality intact — SMS receiving, allocation, permissions, auth, payouts, reports, schema all untouched)

=== Rate Limit ===
Per second allowed:  200/s effective ceiling (ingest limiter = 12,000 per 60s window) — 35/s runs at ~17.5% of it (5.7× headroom)
Per minute allowed:  12,000/min ingest (env INCOMING_SMS_RATE_PER_MIN; default documented in .env.example)
Per hour allowed:    ~720,000/hr sustained at the ingest limiter
Per-IP limit:        YES — ingest limiter buckets per source IP (trust-proxy enabled); global API limiter 1,200/min/IP for everything else
Burst limit:         No separate burst bucket — fixed-window limiter only; abuse protection preserved (login 10/5min/IP brute-force guard, heavy-write 120/min, malformed payloads still rejected)

=== Test ===  (10 seconds per rate, per-second verification, dedicated range PK-Rate-Test → mgr1)
10/sec → target 100, accepted 100, 429s 0, other errors 0   (per-second: 10×10 — every second exact; DB rows 100; max latency 7ms)
20/sec → target 200, accepted 200, 429s 0, other errors 0   (per-second: 20×10 — every second exact; DB rows 200; max latency 14ms)
35/sec → target 350, accepted 350, 429s 0, other errors 0   (per-second: 35×10 — every second exact; DB rows 350; max latency 6ms)
RESULT: SUSTAINED 35/s OK — 2,100/min ≪ 12,000/min limit; server log showed zero errors during the run.
```

---

## 1. Login URL — details

- `/login` is now the canonical login route (same WHIZZ login page as before, `wz-login-shell`).
- Old URLs **301-redirect** to it — no duplicate access paths:
  - `/panel-login` → 301 → `/login`
  - `/panel-login.html` → 301 → `/login`
  - `/login.html` → 301 → `/login`
  - `/` → 302 → `/login`
- Authentication logic, sessions and permissions were **not modified** — only route names/redirects.
- Every internal reference updated: all 5 role panels (session-guard, fetch `.catch`, outer catch, logout fallback — 4 spots each), set-password.html, public-request.html, `assets/api.js` (7 refs + regex), `backend/pubreq.js` email links, demo-user script, run docs.
- Verified: login + logout + protected-route redirects for **all 5 roles** (suite section E), plus the new legacy-redirect assertions (section E2).

## 2. Cleanup — inventory-first deletions

Everything below was **inspected for references first** (imports, routes, script tags, build files, runtime usage), then deleted, then a dangling-reference sweep re-confirmed zero remaining refs:

| Removed | Why confirmed safe |
|---|---|
| `mobile-app/` | No web/backend/build file references it; nothing shared with the panel |
| `assets/chat.js` | Dead duplicate of the admin chat widget; no page loads it (suite asserts this); backend chat API (`backend/chat.js`) is separate and **kept** |
| `backend/assistant.js` | 66-byte no-op stub (`refreshRanges:()=>{}`), zero `require` references — old AI-assistant remnant |
| `scripts/verify-chat-deploy.sh` | Verified deployment of the deleted chat.js |
| `AI-HANDOVER-README.md` | Byte-identical copy of README.md |
| `CHAT-DUPLICATES-AND-FILE-PICKER-FIX-REPORT.md` | Historical report for removed features |
| `tests/assistant_ranges.json` / `.txt` | Orphaned fixtures of the removed assistant (the "AI ASSISTANT KNOWLEDGE" comment in management.html was already stale) |
| 9 test files | Each verified to test ONLY discontinued features: chat duplicates/file-picker (×2), p21 corrections, app-update (mobile), p19e/p19g chat suites, regression-full-audit (asserts deleted mobile APKs), p19f-verify + verify-galaxy-cleanup-and-security (assert Galaxy-era file inventory — permanently broken by design) |

**Kept (30 tests)** — all still target current functionality: core verify-* suites, p12/p19*/p20-cdr, the p19d payout E2E pair (Complaints = owner bug-reports, unrelated), p21-* chat **backend API** tests (mounted, live endpoints), super-manager/channel, phase2 suite, + the new `tests/sms-rate-test.js`.
**Surgically edited, not deleted (3):** `p19j` (Binance UID coverage kept, dead chat.js checks removed), `p19k` (provider-cost coverage kept, chat checks removed), `verify-self-allocate-and-readability` (chat.js load check removed) — the last one re-run after editing: **52/52 PASS**.
**Bench toolkit kept:** `bench-toolkit/`, `scripts/bench-20m.js`, `scripts/bench-bulkload.js` load-test the *current* backend — judged by utility, they are useful.
Also completed: `backend/pubreq.js` had 10 residual "Galaxy SMS" brand strings (page title, emails, form labels) → rebranded to WHIZZ; its 2 `/panel-login` links → `/login`.
**Nothing else touched:** no schema, no SMS/CDR/payout math, no allocation/permissions/auth logic, no UI beyond the login URL references.

## 3. Rate limit — the actual fix

Inspection found the real bottleneck: `/api/webhook/sms` (the primary carrier ingest endpoint) was **not exempt** from the global 1,200/min API limiter and had **no ingest limiter of its own** — so it was capped at 20/s per IP, *below* the 35/s requirement. `/api/incoming-sms` had the 12,000/min ingest limiter; the webhook route silently didn't.

Changes (consistent, no conflicting values):
- `/api/webhook/sms` added to the global limiter's exempt list (alongside health/login/incoming-sms).
- The existing `smsIngestLimit` (12,000/min/IP, env-configurable) now also guards `/api/webhook/sms`.
- `.env.example` documents the tuning (35/s = 2,100/min vs 12,000/min default).
- All other limiters **left ON and unchanged** — brute-force, abuse and malformed-payload protection preserved.

## 4. Rate test — per-second results

`node tests/sms-rate-test.js` (kept in the repo for future use): sets up range `PK-Rate-Test` with 35 numbers allocated to a manager, then fires webhook ingest at an even per-second cadence, buckets results per 1-second interval, requires the **full target in EVERY second**, and confirms DB persistence via search.

- **10/s × 10s:** accepted `10 10 10 10 10 10 10 10 10 10` → 100/100, 0×429, 0 errors, 100 rows in DB, max latency 7 ms
- **20/s × 10s:** accepted `20 20 20 20 20 20 20 20 20 20` → 200/200, 0×429, 0 errors, 200 rows in DB, max latency 14 ms
- **35/s × 10s:** accepted `35 35 35 35 35 35 35 35 35 35` → 350/350, 0×429, 0 errors, 350 rows in DB, max latency 6 ms
- Server log during the run: zero errors/warnings; every message logged `[INCOMING_SMS] saved`.

Note: the test wrote 650 real rows into the **local dev database** (`backend/data.sqlite`, not in the zip) under range `PK-Rate-Test`.

## 5. Full verification summary

| Check | Result |
|---|---|
| `/login` serves WHIZZ login page | ✔ 200 |
| `/panel-login`, `/panel-login.html`, `/login.html` | ✔ 301 → `/login` |
| `/` | ✔ 302 → `/login` |
| Login/logout/protected-redirects, all 5 roles | ✔ |
| Phase-2 regression suite | ✔ **116/116** (112 previous + 4 new login-route checks) |
| Edited legacy suite (self-allocate/readability) | ✔ 52/52 |
| Dangling-reference sweep after deletions | ✔ clean (`/assets/chat.js` → 404; only remaining "chat.js" mention is a negative assertion) |
| Sustained 35/s ingest, per-second | ✔ PASS |
| Syntax check every edited JS + inline HTML scripts | ✔ 0 failures |

Updated archive: `/home/user/Whizz-sms-PHASE2-BUILD2.zip` (172 files, was 207).

Pre-existing notes (unchanged by this task): 7 kept legacy tests need `jsdom`, which is not in package.json; the login limiter (10/5min/IP) can make back-to-back suite runs wait — the rate test now waits out the window automatically.
