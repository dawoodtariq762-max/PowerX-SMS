#!/usr/bin/env node
/* ============================================================================
 * WHIZZ — optional local helper
 * ----------------------------------------------------------------------------
 * Creates one manager, one agent and one client so you can open all four
 * panels while reviewing the redesign.
 *
 * This script is NOT part of the application. It only calls the public REST
 * API exactly as the admin UI does — it does not touch the schema, the
 * backend code, or any business logic. Delete it whenever you like.
 *
 * Usage (server must already be running):
 *     node whizz-create-demo-users.js
 *     node whizz-create-demo-users.js --url http://localhost:4100
 * ========================================================================== */

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
};

const BASE  = argOf('--url', 'http://localhost:4000').replace(/\/$/, '');
const ADMIN = argOf('--admin', 'vibepk');
const PASS  = argOf('--password', 'vibepk123');

async function call(method, path, body, token) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${path} — ${typeof data === 'string' ? data.slice(0, 120) : JSON.stringify(data).slice(0, 160)}`);
  return data;
}

const DEMO = [
  { role: 'manager', username: 'mgr1',    password: 'mgr123',    name: 'Manager One' },
  { role: 'agent',   username: 'agent1',  password: 'agent123',  name: 'Agent One',  under: 'mgr1'   },
  { role: 'client',  username: 'client1', password: 'client123', name: 'Client One', under: 'agent1' },
];

(async () => {
  console.log(`\nWHIZZ demo users  →  ${BASE}\n`);

  let token;
  try {
    ({ token } = await call('POST', '/login', { username: ADMIN, password: PASS }));
    console.log(`  admin login ....... ok (${ADMIN})`);
  } catch (e) {
    console.error(`  admin login ....... FAILED: ${e.message}`);
    console.error(`\n  Is the server running at ${BASE}?`);
    console.error(`  If you changed the admin password, pass it:`);
    console.error(`      node whizz-create-demo-users.js --admin <user> --password <pass>\n`);
    process.exit(1);
  }

  /* the API lists users per role: GET /api/users/:role */
  const fetchRole = async (role) => {
    try {
      const r = await call('GET', '/users/' + role, null, token);
      return Array.isArray(r) ? r : (r.users || r.rows || []);
    } catch { return []; }
  };
  let list = [];
  const refresh = async () => {
    list = [].concat(...(await Promise.all(['manager', 'agent', 'client'].map(fetchRole))));
  };
  await refresh();
  const idOf = (u) => (list.find((x) => x.username === u) || {}).id;

  for (const d of DEMO) {
    if (idOf(d.username)) { console.log(`  ${d.role.padEnd(8)} .......... already exists (${d.username})`); continue; }
    const payload = { username: d.username, password: d.password, role: d.role, name: d.name };
    if (d.under) {
      const pid = idOf(d.under);
      if (!pid) { console.log(`  ${d.role.padEnd(8)} .......... skipped, parent "${d.under}" missing`); continue; }
      payload.parent_id = pid;
    }
    try {
      await call('POST', '/users', payload, token);
      await refresh();
      console.log(`  ${d.role.padEnd(8)} .......... created  ${d.username} / ${d.password}`);
    } catch (e) {
      console.log(`  ${d.role.padEnd(8)} .......... FAILED: ${e.message}`);
    }
  }

  console.log(`\n  Sign in at ${BASE}/login\n`);
  console.log('    Admin    vibepk  / vibepk123');
  console.log('    Manager  mgr1    / mgr123');
  console.log('    Agent    agent1  / agent123');
  console.log('    Client   client1 / client123\n');
  console.log('  Note: the panels will show zeros until real SMS data exists.');
  console.log('  That is expected — no placeholder data was added anywhere.\n');
})();
