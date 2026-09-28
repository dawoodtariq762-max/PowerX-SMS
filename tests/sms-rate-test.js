#!/usr/bin/env node
/* ============================================================================
 * WHIZZ — sustained SMS ingest rate test (10 / 20 / 35 SMS per second)
 * ----------------------------------------------------------------------------
 * Requirement under test: 35 SMS must be ACCEPTED during EVERY one-second
 * interval (35/s = 2,100/min = 126,000/h sustained), with zero 429s.
 *
 * How it works:
 *   setup   — admin login; ensure range PK-Rate-Test + 35 imported numbers
 *             (allocated to mgr1) so every message hits a real, allocated number
 *   phases  — 10/s, 20/s, 35/s; each phase runs --seconds (default 10).
 *             Requests are evenly scheduled inside each 1-second bucket
 *             (k * 1000/rps ms offset), then fired against POST /api/webhook/sms.
 *   verify  — per-second buckets: sent / accepted(200) / 429 / other + latency.
 *             PASS requires accepted == target in EVERY second of every phase,
 *             zero 429s, zero other errors, and the DB actually contains every
 *             accepted message (GET /api/sms/paged?search=... total check).
 *
 * Usage: node tests/sms-rate-test.js [--url http://localhost:4000] [--seconds 10]
 * ========================================================================== */
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const BASE = argOf('--url', 'http://localhost:4000').replace(/\/$/, '');
const SECONDS = Math.max(3, parseInt(argOf('--seconds', '10'), 10) || 10);
const PHASES = [10, 20, 35];
const RANGE = 'PK-Rate-Test';
const POOL = Array.from({ length: 35 }, (_, i) => '9230199' + String(i).padStart(5, '0')); // 923019900000..00034

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  console.log(`\nWHIZZ SMS ingest rate test → ${BASE}  (${SECONDS}s per phase, phases: ${PHASES.join('/')} per sec)\n`);

  /* ---------- setup ---------- */
  /* /api/login is rate-limited to 10 attempts / 5 min per IP (brute-force guard).
     If a previous test run exhausted the budget, wait out the window. */
  let login = await api('POST', '/api/login', { username: 'vibepk', password: 'vibepk123' });
  if (login.status === 429) {
    const probe = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const wait = Math.min(330, Math.max(5, parseInt(probe.headers.get('retry-after') || '300', 10) + 2));
    console.log(`(login rate-limit window exhausted — waiting ${wait}s for reset)`);
    await sleep(wait * 1000);
    login = await api('POST', '/api/login', { username: 'vibepk', password: 'vibepk123' });
  }
  if (!login.data.token) { console.error('admin login failed:', JSON.stringify(login.data).slice(0, 160)); process.exit(2); }
  const T = login.data.token;

  const ranges = await api('GET', '/api/ranges', null, T);
  const rarr = Array.isArray(ranges.data) ? ranges.data : (ranges.data.ranges || []);
  if (!rarr.some(r => r.name === RANGE)) {
    const cr = await api('POST', '/api/ranges', { name: RANGE, prefix: '92301', country: 'PK', currency: 'USD', rate_7_1: '0.01', payment_type: 'weekly_7_1', status: 'Active' }, T);
    console.log(`setup: range ${RANGE} created (${cr.status})`);
  } else console.log(`setup: range ${RANGE} exists`);

  const imp = await api('POST', '/api/numbers/import', { range_name: RANGE, numbers: POOL }, T);
  if (imp.data.job_id) {
    for (let i = 0; i < 60; i++) {
      const j = await api('GET', '/api/numbers/import-jobs/' + imp.data.job_id, null, T);
      if (j.data.status === 'done' || j.data.status === 'error') { console.log(`setup: import ${j.data.status} (inserted ${j.data.inserted}, skipped ${j.data.skipped})`); break; }
      await sleep(250);
    }
  } else console.log('setup: import →', JSON.stringify(imp.data).slice(0, 120));

  /* allocate any unallocated pool numbers to mgr1 (realistic attribution) */
  const mgrs = await api('GET', '/api/users/manager', null, T);
  const mgrList = Array.isArray(mgrs.data) ? mgrs.data : (mgrs.data.users || mgrs.data.rows || []);
  let mgr = mgrList.find(u => u.username === 'mgr1');
  if (!mgr) {
    await api('POST', '/api/users', { username: 'mgr1', password: 'mgr123', role: 'manager', name: 'Manager One' }, T);
    const m2 = await api('GET', '/api/users/manager', null, T);
    mgr = (Array.isArray(m2.data) ? m2.data : (m2.data.users || [])).find(u => u.username === 'mgr1');
  }
  const nums = await api('GET', '/api/numbers?search=9230199&limit=100', null, T);
  const nrows = nums.data.rows || [];
  const unalloc = nrows.filter(n => !n.manager_id && !n.agent_id && !n.client_id).map(n => n.id);
  if (unalloc.length && mgr) {
    const al = await api('POST', '/api/numbers/allocate', { ids: unalloc, target_id: mgr.id, payterm: 'weekly_7_1' }, T);
    console.log(`setup: allocated ${unalloc.length} numbers to mgr1 (${al.status})`);
  } else console.log(`setup: pool numbers already allocated (${nrows.length} found)`);
  if (nrows.length < 35) { console.error(`setup: only ${nrows.length}/35 pool numbers found — aborting`); process.exit(2); }

  /* ---------- phases ---------- */
  let allPass = true;
  const summary = [];
  for (const rps of PHASES) {
    const tag = `rate-test p${rps}`;
    const results = [];
    const t0 = Date.now();
    const jobs = [];
    for (let s = 0; s < SECONDS; s++) {
      for (let k = 0; k < rps; k++) {
        const at = s * 1000 + Math.round(k * (1000 / rps));
        jobs.push((async () => {
          const wait = t0 + at - Date.now();
          if (wait > 0) await sleep(wait);
          const sent = Date.now();
          let status = 0;
          try {
            const r = await fetch(BASE + '/api/webhook/sms', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: POOL[(s * rps + k) % POOL.length], cli: 'RATE' + rps, message: `${tag} s${s} k${k} code ${100000 + ((s * rps + k) % 900000)}` }),
            });
            status = r.status;
            await r.text();
          } catch (e) { status = -1; }
          results.push({ sec: s, status, ms: Date.now() - sent });
        })());
      }
    }
    await Promise.all(jobs);
    const wall = ((Date.now() - t0) / 1000).toFixed(1);

    /* per-second buckets */
    const buckets = Array.from({ length: SECONDS }, (_, s) => ({ sent: 0, ok: 0, r429: 0, other: 0, maxMs: 0 }));
    for (const r of results) {
      const b = buckets[r.sec];
      b.sent++; b.maxMs = Math.max(b.maxMs, r.ms);
      if (r.status === 200) b.ok++; else if (r.status === 429) b.r429++; else b.other++;
    }
    const tot = buckets.reduce((a, b) => ({ sent: a.sent + b.sent, ok: a.ok + b.ok, r429: a.r429 + b.r429, other: a.other + b.other, maxMs: Math.max(a.maxMs, b.maxMs) }), { sent: 0, ok: 0, r429: 0, other: 0, maxMs: 0 });
    const minOk = Math.min(...buckets.map(b => b.ok));
    const badSecs = buckets.map((b, i) => ({ i, ...b })).filter(b => b.ok !== rps || b.r429 || b.other);

    /* DB persistence check: every accepted message must be stored */
    await sleep(400);
    const chk = await api('GET', `/api/sms/paged?search=${encodeURIComponent(tag + ' ')}&limit=1`, null, T);
    const dbTotal = chk.data.total || 0;

    const pass = badSecs.length === 0 && tot.r429 === 0 && tot.other === 0 && dbTotal >= tot.ok;
    allPass = allPass && pass;
    summary.push({ rps, seconds: SECONDS, wall, ...tot, minOk, dbTotal, pass });

    console.log(`── ${rps}/s × ${SECONDS}s ${pass ? 'PASS' : 'FAIL'} ─────────────────────────`);
    console.log(`   per-second accepted: ${buckets.map(b => b.ok).join(' ')}  (target ${rps} in EVERY second; min ${minOk})`);
    console.log(`   totals: sent=${tot.sent} accepted=${tot.ok} 429s=${tot.r429} other=${tot.other} | max latency=${tot.maxMs}ms | wall=${wall}s`);
    console.log(`   stored in DB (search '${tag}'): ${dbTotal} rows (accepted=${tot.ok})`);
    if (badSecs.length) console.log(`   BAD seconds: ${JSON.stringify(badSecs)}`);
    await sleep(3000); /* courtesy gap between phases */
  }

  console.log(`\n${'═'.repeat(64)}`);
  for (const s of summary) console.log(`${String(s.rps).padStart(2)}/s → target ${s.rps * s.seconds}, accepted ${s.ok}, 429s ${s.r429}, other ${s.other}, DB rows ${s.dbTotal}, min-per-second ${s.minOk}  ${s.pass ? 'PASS' : 'FAIL'}`);
  console.log(`RESULT: ${allPass ? 'SUSTAINED RATE OK — 35/s accepted in every 1-second interval, zero 429s' : 'FAILED — see per-phase details above'}`);
  console.log('═'.repeat(64) + '\n');
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
