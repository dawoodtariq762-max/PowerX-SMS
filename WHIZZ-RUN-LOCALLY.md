# WHIZZ — run this locally

Requires **Node.js 20 or newer** (`node -v` to check).

## 1. Install and start

```bash
cd whizz-panel
npm install
npm start
```

Then open:

```
http://localhost:4000/login
```

The server creates its own SQLite database on first run
(`backend/data.sqlite`) and seeds an admin account.

## 2. Log in

On a **fresh** database the seeded admin is:

| username | password    |
|----------|-------------|
| `vibepk` | `vibepk123` |

That lands you on the **Admin** panel.

### Seeing the other three panels

To review the Agent, Client and Manager panels you need one user of each
role. Either create them from *User Management* inside the admin panel, or
run this optional helper **while the server is running** (second terminal):

```bash
node whizz-create-demo-users.js
```

It creates manager → agent → client via the normal REST API, exactly as the
admin UI does. Re-running it is safe; it skips users that already exist.

| role | username | password |
|---|---|---|
| Admin | `vibepk` | `vibepk123` |
| Manager | `mgr1` | `mgr123` |
| Agent | `agent1` | `agent123` |
| Client | `client1` | `client123` |

> `whizz-create-demo-users.js` is a convenience script for local review only.
> It is not part of the application and touches no backend code — delete it
> whenever you want.

**The panels will show zeros** until real SMS data exists in the database.
That is expected: no placeholder or fake data was added anywhere, per your
instruction.

## 3. What to look at

| Page | What changed |
|---|---|
| `/login` | Fully redesigned — compact centred card, WHIZZ logo, silver background |
| Agent → Dashboard | Rebuilt to the reference layout (tiles, strips, chart, metric column) |
| Agent → sidebar "SMS Numbers" | **Click it** — the submenu now expands smoothly instead of snapping |
| Agent → SMS Numbers page | **Open "Select Range"** — the dropdown now slides/fades open and closed |
| Client / Admin / Manager | WHIZZ theme applied; white content, blue UI, navy nav |

Resize the browser down to phone width on any page — the layouts reflow,
no horizontal scrolling.

## 4. Turning optional services off

SMPP, backups and provider sync are on by default. To run a quiet local
instance:

```bash
SMPP_ENABLED=false BACKUP_ENABLED=false SYNC_ENABLED=false npm start
```

## 5. Where the redesign lives

| File | Role |
|---|---|
| `assets/whizz.css` | The entire theme. Every rule is scoped `body.whizz` |
| `assets/whizz-ui.js` | Submenu + dropdown animation, dashboard tile navigation |
| `assets/whizz-*.png` | Logo, mark, app icon, favicon |

`galaxy.css`, `galaxy.js` and `galaxy-light.css` were **not modified** —
WHIZZ is loaded after them and overrides by scope. Nothing under
`backend/` was changed.

To disable the whole redesign and see the original UI, remove `class="whizz"`
from the `<html>` and `<body>` tags of any panel file.
