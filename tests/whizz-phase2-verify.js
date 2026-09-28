#!/usr/bin/env node
/* ============================================================================
 * WHIZZ — Phase 2, Build 2 verification suite (local only)
 * ----------------------------------------------------------------------------
 * Verifies, against a RUNNING local server (default http://localhost:4000):
 *   A. Branding/routes  — WHIZZ titles, no Galaxy user-visible branding,
 *                         legacy redirects, /Galaxy-Sms blocked
 *   B. Theme rollout    — whizz.css/whizz-ui.js on every panel
 *   C. Removed features — country map, complaints (all 4 panels)
 *   D. Provider filter  — SMS Report provider param on /api/sms/paged +
 *                         /api/sms/report group=provider, combined filters,
 *                         admin-only backend enforcement
 *   E. Failed SMS       — genuine failures captured with real reasons,
 *                         retry/ignore, source capture, CDR page present
 *   F. Core preserved   — login/logout, hierarchy, allocation, numbers,
 *                         reports, rates, dashboard, exports (whizz-*.csv)
 *
 * Usage:  node tests/whizz-phase2-verify.js [--url http://localhost:4000]
 * ========================================================================== */
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const BASE = argOf('--url', 'http://localhost:4000').replace(/\/$/, '');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✘ ${name}${extra ? ' — ' + extra : ''}`); }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }

async function call(method, path, body, token, raw) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const RANGE = 'PK-WHIZZ-Test';
const PROVIDER = 'ProviderAlpha';
const N1 = '923001234567', N2 = '923001234568';
/* unique per run: a re-run must not find the 'missing' number already imported */
const RUN = String(Date.now()).slice(-6);
const MISSING = '923007' + RUN;
const OTP1 = '45' + RUN, OTP2 = '11' + RUN;

(async () => {
  console.log(`\nWHIZZ Phase 2 verification → ${BASE}\n`);

  /* ================= A. LOGIN + SETUP ================= */
  section('A. Admin login + demo hierarchy');
  const adminLogin = await call('POST', '/api/login', { username: 'vibepk', password: 'vibepk123' });
  ok('admin login (vibepk)', adminLogin.status === 200 && adminLogin.data.token, JSON.stringify(adminLogin.data).slice(0, 120));
  if (!adminLogin.data.token) { console.log('\nCannot continue without admin token.'); process.exit(1); }
  const T = adminLogin.data.token;
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T };

  const roleList = async (role) => {
    const r = await fetch(BASE + '/api/users/' + role, { headers: H }); const d = await r.json();
    return Array.isArray(d) ? d : (d.users || d.rows || []);
  };
  const ensureUser = async (u) => {
    let list = await roleList(u.role);
    let found = list.find(x => x.username === u.username);
    if (!found) {
      const payload = { username: u.username, password: u.password, role: u.role, name: u.name };
      if (u.under) { const pl = await roleList(u.underRole); const p = pl.find(x => x.username === u.under); if (p) payload.parent_id = p.id; }
      await call('POST', '/api/users', payload, T);
      list = await roleList(u.role); found = list.find(x => x.username === u.username);
    }
    return found;
  };
  const mgr = await ensureUser({ role: 'manager', username: 'mgr1', password: 'mgr123', name: 'Manager One' });
  const agt = await ensureUser({ role: 'agent', username: 'agent1', password: 'agent123', name: 'Agent One', under: 'mgr1', underRole: 'manager' });
  const cli = await ensureUser({ role: 'client', username: 'client1', password: 'client123', name: 'Client One', under: 'agent1', underRole: 'agent' });
  ok('manager mgr1 exists', !!mgr); ok('agent agent1 exists', !!agt); ok('client client1 exists', !!cli);

  /* provider registry (real Provider Management source used by the filters) */
  const provInfo = await call('GET', '/api/providers-info', null, T);
  let hasProv = (provInfo.data.providers || []).some(p => p.name === PROVIDER);
  if (!hasProv) {
    await call('POST', '/api/providers-info', { name: PROVIDER, conn_type: 'HTTP', payment_term: 'Monthly', currency: 'USD', status: 'Active' }, T);
    const pi2 = await call('GET', '/api/providers-info', null, T);
    hasProv = (pi2.data.providers || []).some(p => p.name === PROVIDER);
  }
  ok('provider registry entry (providers-info)', hasProv);

  /* range with provider + numbers */
  const ranges = await call('GET', '/api/ranges', null, T);
  const rarr = Array.isArray(ranges.data) ? ranges.data : (ranges.data.ranges || []);
  let range = rarr.find(r => r.name === RANGE);
  if (!range) {
    const cr = await call('POST', '/api/ranges', { name: RANGE, prefix: '92300', country: 'PK', currency: 'USD', rate_7_1: '0.02', payment_type: 'weekly_7_1', provider: PROVIDER, status: 'Active' }, T);
    ok('range created with provider', cr.status === 200, JSON.stringify(cr.data).slice(0, 120));
    const r2 = await call('GET', '/api/ranges', null, T);
    range = (Array.isArray(r2.data) ? r2.data : (r2.data.ranges || [])).find(r => r.name === RANGE);
  } else ok('range already exists', true);
  ok('range has provider=ProviderAlpha', range && range.provider === PROVIDER, range ? `provider='${range.provider}'` : 'no range');

  const imp = await call('POST', '/api/numbers/import', { range_name: RANGE, numbers: [N1, N2] }, T);
  if (imp.data.job_id) {
    for (let i = 0; i < 40; i++) {
      const j = await call('GET', '/api/numbers/import-jobs/' + imp.data.job_id, null, T);
      if (j.data.status === 'done' || j.data.status === 'error') break;
      await sleep(250);
    }
  }
  ok('numbers import accepted', imp.status === 200);

  const nums = await call('GET', '/api/numbers?search=9230012&limit=50', null, T);
  const nrows = nums.data.rows || nums.data.numbers || (Array.isArray(nums.data) ? nums.data : []);
  const n1row = nrows.find(x => String(x.number).replace(/\D/g, '') === N1);
  const n2row = nrows.find(x => String(x.number).replace(/\D/g, '') === N2);
  ok('imported numbers visible', !!n1row && !!n2row, `found ${nrows.length} rows`);

  if (n1row && !n1row.manager_id && !n1row.agent_id && !n1row.client_id && mgr) {
    const ids = [n1row.id, n2row.id].filter(Boolean);
    const al = await call('POST', '/api/numbers/allocate', { ids, target_id: mgr.id, payterm: 'weekly_7_1' }, T);
    ok('range/number allocation to manager', al.status === 200, JSON.stringify(al.data).slice(0, 140));
  } else ok('numbers already allocated', true);

  /* ================= B. INBOUND SMS: SUCCESS + GENUINE FAILURES ================= */
  section('B. Inbound SMS — success path untouched, genuine failures captured');
  const s1 = await call('POST', '/api/webhook/sms', { number: N1, cli: '777001', message: 'Your WHIZZ code is ' + OTP1 });
  ok('allocated number → SMS stored (200)', s1.status === 200 && s1.data.ok === true, JSON.stringify(s1.data).slice(0, 140));
  const s2 = await call('POST', '/api/webhook/sms', { number: N2, cli: '777002', message: 'code 987654' });
  ok('second allocated number → SMS stored', s2.status === 200 && s2.data.ok === true);

  const f1 = await call('POST', '/api/webhook/sms', { number: MISSING, cli: '777003', message: 'code ' + OTP2 });
  ok('missing number → 404 rejected', f1.status === 404 && /Number not found\/allocated/.test(f1.data.error || ''), JSON.stringify(f1.data).slice(0, 140));
  const f2 = await call('POST', '/api/webhook/sms', { cli: '777004', message: 'no destination given' });
  ok('no number field → 400 rejected', f2.status === 400 && /number\/to field required/.test(f2.data.error || ''), JSON.stringify(f2.data).slice(0, 140));

  const fq = await call('GET', '/api/failed-sms', null, T);
  const rowsF = Array.isArray(fq.data) ? fq.data : [];
  const rowMissing = rowsF.find(r => String(r.number).replace(/\D/g, '') === MISSING && r.status === 'Pending');
  const rowNoNum = rowsF.find(r => r.error === 'number/to field required' && r.status === 'Pending');
  ok('failed queue lists missing-number SMS', !!rowMissing);
  ok('failed queue lists no-number SMS', !!rowNoNum);
  ok('failure reason = real backend reason (not invented)', rowMissing && rowMissing.error === 'Number not found/allocated in system');
  ok('failed row keeps cli/message', rowMissing && rowMissing.cli === '777003' && rowMissing.message.includes(OTP2));
  ok('failed row captures source_ip (new)', rowMissing && String(rowMissing.source_ip || '').length > 0, rowMissing ? `source_ip='${rowMissing.source_ip}'` : '');
  ok('failed row has created_at + id', rowMissing && !!rowMissing.created_at && !!rowMissing.id);

  /* retry while still missing → honest 404, retry_count increases, stays Pending */
  const rt1 = await call('POST', `/api/failed-sms/${rowMissing.id}/retry`, {}, T);
  ok('retry while number still missing → 404', rt1.status === 404 && /still not found/.test(rt1.data.error || ''), JSON.stringify(rt1.data).slice(0, 120));
  const fq2 = await call('GET', '/api/failed-sms', null, T);
  const rm2 = (Array.isArray(fq2.data) ? fq2.data : []).find(r => r.id === rowMissing.id);
  ok('retry_count incremented, status still Pending', rm2 && rm2.retry_count >= 1 && rm2.status === 'Pending');

  /* import + allocate the missing number, retry → becomes a normal SMS */
  await call('POST', '/api/numbers/import', { range_name: RANGE, numbers: [MISSING] }, T);
  await sleep(1200);
  const nums2 = await call('GET', '/api/numbers?search=' + MISSING + '&limit=20', null, T);
  const mrow = (nums2.data.rows || []).find(x => String(x.number).replace(/\D/g, '') === MISSING);
  if (mrow && mgr && !mrow.manager_id) await call('POST', '/api/numbers/allocate', { ids: [mrow.id], target_id: mgr.id, payterm: 'weekly_7_1' }, T);
  const rt2 = await call('POST', `/api/failed-sms/${rowMissing.id}/retry`, {}, T);
  ok('retry after allocation → ok', rt2.status === 200 && rt2.data.ok === true, JSON.stringify(rt2.data).slice(0, 120));
  const fq3 = await call('GET', '/api/failed-sms', null, T);
  const rm3 = (Array.isArray(fq3.data) ? fq3.data : []).find(r => r.id === rowMissing.id);
  ok('retried row status = Retried (original kept, not deleted)', rm3 && rm3.status === 'Retried');
  const pagedRetry = await call('GET', '/api/sms/paged?number=' + MISSING, null, T);
  ok('retried SMS now a normal successful record', (pagedRetry.data.total || 0) >= 1 && (pagedRetry.data.rows || []).some(r => (r.message || '').includes(OTP2)));

  /* ignore flow */
  const ig = await call('DELETE', `/api/failed-sms/${rowNoNum.id}`, null, T);
  const fq4 = await call('GET', '/api/failed-sms', null, T);
  const rn4 = (Array.isArray(fq4.data) ? fq4.data : []).find(r => r.id === rowNoNum.id);
  ok('ignore → status Ignored', ig.status === 200 && rn4 && rn4.status === 'Ignored');

  /* ================= C. PROVIDER FILTER (CDR) ================= */
  section('C. Provider filter — real provider data, combined with existing filters');
  const ukToday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('/').reverse().join('-');
  const pAll = await call('GET', '/api/sms/paged', null, T);
  const pProv = await call('GET', '/api/sms/paged?provider=' + encodeURIComponent(PROVIDER), null, T);
  const pNone = await call('GET', '/api/sms/paged?provider=NoSuchProvider', null, T);
  ok('provider=ProviderAlpha returns the range\'s SMS', pProv.status === 200 && pProv.data.total >= 3, `total=${pProv.data.total}`);
  ok('unknown provider → 0 rows (exact match on ranges.provider)', pNone.status === 200 && pNone.data.total === 0);
  ok('provider filter ⊆ unfiltered', pProv.data.total <= pAll.data.total);

  const pMgr = await call('GET', `/api/sms/paged?provider=${encodeURIComponent(PROVIDER)}&manager=mgr1`, null, T);
  ok('provider + manager combined', pMgr.data.total >= 3, `total=${pMgr.data.total}`);
  const pMgrBad = await call('GET', `/api/sms/paged?provider=${encodeURIComponent(PROVIDER)}&manager=nobody`, null, T);
  ok('provider + wrong manager → 0 (AND semantics)', pMgrBad.data.total === 0);
  const pDate = await call('GET', `/api/sms/paged?provider=${encodeURIComponent(PROVIDER)}&from=${ukToday}&to=${ukToday}`, null, T);
  ok('provider + date combined', pDate.data.total >= 3, `total=${pDate.data.total}`);
  const pSearch = await call('GET', `/api/sms/paged?provider=${encodeURIComponent(PROVIDER)}&search=${OTP1}`, null, T);
  ok('provider + search combined → only matching SMS', pSearch.data.total === 1);
  const pRange = await call('GET', `/api/sms/paged?provider=${encodeURIComponent(PROVIDER)}&range=${encodeURIComponent(RANGE)}`, null, T);
  ok('provider + range combined', pRange.data.total >= 3);

  const rep = await call('GET', '/api/sms/report?group=provider', null, T);
  const repRow = (rep.data.rows || []).find(r => r.dims && r.dims.provider === PROVIDER);
  ok('report group=provider aggregates under real provider name', !!repRow && repRow.sms >= 3, JSON.stringify(rep.data.rows || []).slice(0, 160));
  const rep2 = await call('GET', '/api/sms/report?group=day,provider', null, T);
  ok('report group=day,provider combined dims', rep2.status === 200 && (rep2.data.rows || []).some(r => r.dims.provider === PROVIDER && r.dims.day));

  /* admin-only enforcement: manager sending provider param must NOT change results */
  const mLogin = await call('POST', '/api/login', { username: 'mgr1', password: 'mgr123' });
  ok('manager login', mLogin.status === 200 && !!mLogin.data.token);
  if (mLogin.data.token) {
    const mAll = await call('GET', '/api/sms/paged', null, mLogin.data.token);
    const mProv = await call('GET', '/api/sms/paged?provider=' + encodeURIComponent(PROVIDER), null, mLogin.data.token);
    ok('manager: provider param ignored (backend admin-only)', mAll.data.total === mProv.data.total, `${mAll.data.total} vs ${mProv.data.total}`);
    const mRep = await call('GET', '/api/sms/report?group=provider', null, mLogin.data.token);
    ok('manager: group=provider rejected/dropped (role dims)', mRep.status === 400 || !(mRep.data.group || []).includes('provider'));
  }

  /* ================= D. CORE PRESERVED ================= */
  section('D. Existing functionality preserved');
  const dash = await call('GET', '/api/dashboard', null, T);
  ok('dashboard ok (keys incl. sms_today, failed_sms_today, sms_by_country — backend untouched)', dash.status === 200 && typeof dash.data.sms_today === 'number' && typeof dash.data.failed_sms_today === 'number' && Array.isArray(dash.data.sms_by_country), `sms_today=${dash.data.sms_today}`);
  const rates = await call('GET', '/api/rate-card', null, T);
  ok('rate card intact', rates.status === 200 && (rates.data || []).some(r => r.name === RANGE));
  const sum = await call('GET', '/api/numbers/summary', null, T);
  ok('numbers summary intact', sum.status === 200);
  const selfLogin = await call('POST', '/api/login', { username: 'agent1', password: 'agent123' });
  const GT = selfLogin.data.token;
  const selfAlloc = await call('GET', '/api/agent/self-allocate/ranges', null, GT);
  ok('agent self-allocate endpoint intact', selfAlloc.status === 200);
  const clis = await call('GET', '/api/sms/clis', null, T);
  ok('CLI list endpoint intact', clis.status === 200 && (clis.data.clis || []).includes('777001'));
  const payoutCheck = await call('GET', '/api/sms/paged?search=' + OTP1, null, T);
  const prow = (payoutCheck.data.rows || [])[0] || {};
  ok('successful SMS payout calculated from rate card (0.02)', String(prow.payout_rate || prow.payout_amount || '') === '0.02', `payout='${prow.payout_rate || prow.payout_amount}'`);

  /* exports → whizz-*.csv filename */
  const exp = await call('POST', '/api/exports', { type: 'sms' }, T);
  if (exp.data.job_id || exp.data.id) {
    const jid = exp.data.job_id || exp.data.id;
    let job = null;
    for (let i = 0; i < 40; i++) { job = await call('GET', '/api/jobs/' + jid, null, T); if (job.data.status === 'done' || job.data.status === 'error') break; await sleep(250); }
    if (job && job.data.status === 'done' && job.data.result && job.data.result.token) {
      const dl = await fetch(BASE + `/api/exports/${jid}/download?token=${encodeURIComponent(job.data.result.token)}`);
      const cd = dl.headers.get('content-disposition') || '';
      ok('CSV export filename rebranded whizz-*.csv', /filename="whizz-sms-/.test(cd), cd.slice(0, 80));
    } else ok('CSV export completed', false, JSON.stringify(job && job.data).slice(0, 120));
  } else ok('CSV export accepted', false, JSON.stringify(exp.data).slice(0, 120));

  /* logout + relogin for every role.
     NOTE: /api/login is rate-limited to 10 attempts / 5 min per IP (pre-existing
     brute-force protection). We therefore reuse the tokens obtained earlier for
     admin/manager/agent (me + logout), and only spend fresh logins on the
     re-login step — total exactly 10, the limiter's budget. */
  section('E. Login → panel → logout → login (all roles)');
  const loginWait = async (u, p) => {
    let l = await call('POST', '/api/login', { username: u, password: p });
    if (l.status === 429) {
      const ra = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const wait = Math.min(330, Math.max(5, parseInt(ra.headers.get('retry-after') || '300', 10) + 2));
      console.log(`    (login rate-limit hit — waiting ${wait}s for window reset)`);
      await sleep(wait * 1000);
      l = await call('POST', '/api/login', { username: u, password: p });
    }
    return l;
  };
  const flows = [
    ['admin', 'vibepk', 'vibepk123', T],
    ['manager', 'mgr1', 'mgr123', mLogin.data.token],
    ['agent', 'agent1', 'agent123', GT],
    ['client', 'client1', 'client123', null],
    ['test', 'test', 'test123', null],
  ];
  for (const [role, u, p, existing] of flows) {
    let tok = existing;
    let loginOk = !!existing;
    if (!tok) { const l = await loginWait(u, p); loginOk = l.status === 200 && !!l.data.token; tok = l.data.token; }
    const me = tok ? await call('GET', '/api/me', null, tok) : { status: 0 };
    const out = tok ? await call('POST', '/api/logout', {}, tok) : { status: 0 };
    const l2 = await loginWait(u, p);
    ok(`${role} login → me → logout → login`, loginOk && me.status === 200 && me.data.role === role && out.status === 200 && l2.status === 200 && !!l2.data.token);
    if (role === 'admin' && l2.data.token) Object.assign(H, { Authorization: 'Bearer ' + l2.data.token });
  }
  const panelForRole = { admin: '/admin', manager: '/manager', agent: '/agent', client: '/client', test: '/test' };
  for (const [role, url] of Object.entries(panelForRole)) {
    const r = await fetch(BASE + url); const html = await r.text();
    ok(`${role} panel served at ${url}`, r.status === 200 && html.includes('<title>WHIZZ'));
  }

  /* ================= F. SERVED PAGES: BRANDING / THEME / REMOVALS / NEW UI ================= */
  section('F. Served pages — branding, theme, removals, new CDR UI');
  const pages = {};
  for (const p of ['/login', '/panel-login', '/admin', '/manager', '/agent', '/client', '/panel-sharing', '/panel-sharing-login', '/management', '/management-login', '/payment', '/payment-login', '/test', '/test-login', '/set-password.html', '/public-request.html']) {
    const r = await fetch(BASE + p); pages[p] = { status: r.status, html: await r.text() };
  }
  for (const [p, v] of Object.entries(pages)) ok(`GET ${p} → 200`, v.status === 200);

  const allHtml = Object.values(pages).map(v => v.html).join('\n');
  ok('no GALAXY-branded browser title anywhere', !/<title>[^<]*(GALAXY|Galaxy)/.test(allHtml));
  ok('no galaxy-logo/galaxy-favicon references on served pages', !/galaxy-(logo|favicon|icon|appicon)\.png/.test(allHtml));
  ok('no visible "GALAXY SMS" brand text (h1/b/alt/title)', !/(<h1>|<b>|alt="|<title>)[^<]*GALAXY SMS/i.test(allHtml));

  const mainPanels = ['/admin', '/manager', '/agent', '/client', '/management', '/panel-sharing', '/payment', '/test'];
  for (const p of mainPanels) {
    const h = pages[p].html;
    ok(`${p}: WHIZZ theme wired (class="whizz" + whizz.css)`, /<html[^>]*class="whizz"/.test(h) && h.includes('/assets/whizz.css') && /<body[^>]*class="[^"]*whizz/.test(h));
  }
  for (const p of ['/admin', '/manager', '/agent', '/client', '/management', '/test']) {
    ok(`${p}: whizz-ui.js loaded`, pages[p].html.includes('/assets/whizz-ui.js'));
  }
  for (const p of ['/admin', '/manager', '/agent', '/client']) {
    const h = pages[p].html;
    ok(`${p}: country map removed (no gxMap / SMS by Country / GX.map)`, !h.includes('gxMap') && !/SMS by Country/i.test(h) && !h.includes('GX.map'));
    ok(`${p}: complaints removed (nav/page/handler/badge/chat.js)`, !h.includes('data-page="complaints"') && !h.includes('page-complaints') && !h.includes("page==='complaints'") && !h.includes('gxCompBadge') && !h.includes('/assets/chat.js'));
  }
  const ah = pages['/admin'].html;
  ok('admin: SMS CDR Stats → Failed SMS nav item', ah.includes('data-page="failedSms"') && ah.includes('Failed SMS'));
  ok('admin: page-failedSms section + allowed page', ah.includes('id="page-failedSms"') && ah.includes("'failedSms'"));
  ok('admin: Failed SMS table columns incl. Provider + Failure Reason', ah.includes('fsProviderOf') && /<th>Provider<\/th><th>Message<\/th><th>Failure Reason<\/th>/.test(ah));
  ok('admin: SMS Report Provider filter UI (after Date/Manager row)', ah.includes('srProviderContainer') && ah.includes('All Providers') && ah.includes("<label>Provider</label>"));
  ok('admin: provider param wired into server-side report call', ah.includes("params.set('provider',provVal)") && ah.includes("provider:g('srProvider')"));
  ok('admin: provider list sourced from real data (providers-info + ranges.provider)', ah.includes("API.get('/providers-info')") && ah.includes('x.provider'));
  ok('admin: existing SMS Detailed Report provider filter untouched', ah.includes('sdSelProviderContainer'));
  /* WHIZZ FINAL: agent Self Allocate page merged into SMS Rate Card section (page kept, standalone nav item removed per final spec) */
  const agentHtml = pages['/agent'].html;
  ok('agent: Self Allocate page preserved + merged into SMS Rate Card / Range Allocation preserved', agentHtml.includes('id="page-selfAllocate"') && agentHtml.includes('SMS Rate Card / Self Allocate') && ah.includes('Range Allocation'));

  const assets = await fetch(BASE + '/assets/whizz.css'); const wcss = await assets.text();
  ok('whizz.css served + map block removed + module-panel block added', assets.status === 200 && !wcss.includes('gx-map') && wcss.includes('body.whizz .side'));
  ok('world.svg removed (map-only asset)', (await fetch(BASE + '/assets/world.svg')).status === 404);
  ok('galaxy.css/js still served (internal technical files retained)', (await fetch(BASE + '/assets/galaxy.css')).status === 200 && (await fetch(BASE + '/assets/galaxy.js')).status === 200);
  const gjs = await (await fetch(BASE + '/assets/galaxy.js')).text();
  ok('GX.map function removed from galaxy.js', !gjs.includes('GX.map'));
  ok('legacy nested Galaxy-Sms folder blocked', (await fetch(BASE + '/Galaxy-Sms/admin.html')).status === 404 && (await fetch(BASE + '/Galaxy-Sms/login.html')).status === 404);
  const rPanel = await fetch(BASE + '/panel-login', { redirect: 'manual' });
  ok('/login serves the WHIZZ login page (canonical)', pages['/login'].status === 200 && pages['/login'].html.includes('wz-login-shell'));
  ok('legacy /panel-login 301-redirects to /login (no duplicate access)', rPanel.status === 301 && (rPanel.headers.get('location') || '') === '/login');
  ok('legacy /login.html + /panel-login.html redirect to /login', (await fetch(BASE + '/login.html', { redirect: 'manual' })).status === 301 && (await fetch(BASE + '/panel-login.html', { redirect: 'manual' })).status === 301);
  const rRoot = await fetch(BASE + '/', { redirect: 'manual' });
  ok('/ redirects to /login', rRoot.status === 302 && (rRoot.headers.get('location') || '') === '/login');
  const health = await (await fetch(BASE + '/health')).json();
  ok('/health reports WHIZZ SMS', health.service === 'WHIZZ SMS');
  const inc = await (await fetch(BASE + '/api/incoming-sms')).json();
  ok('/api/incoming-sms info rebranded', /WHIZZ SMS incoming SMS endpoint/.test(inc.service || ''));

  /* ================= SUMMARY ================= */
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  • ' + f)); }
  console.log('═'.repeat(64) + '\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
