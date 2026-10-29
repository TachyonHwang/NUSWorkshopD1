# Snip: One Backend, Two Clients

One tiny URL-shortening API, used by an Angular browser app and a Node command-line
client. Both clients share the same in-memory links and hit counts. Restarting the
backend clears its data.

## Repository Layout

This repository uses a branch per layer. `main` is an aggregator with four Git
submodules pointing to branches of **this same repository**, not separate repos.
Each pointer pins an exact commit; its configured branch is used by `--remote`.

| Path | Tracking branch | Contents |
| --- | --- | --- |
| `backend/` | `backend` | Single-file Bun server, zero npm dependencies |
| `frontend/` | `frontend` | Angular 19 app, signals, HttpClient, design system |
| `cli/` | `cli` | Zero-dependency CommonJS Node CLI and shell wrappers |
| `bundle/` | `bundle` | Generated release output; never hand-edit |

The layer branches have independent orphan histories. They do not contain the
aggregator's submodules, so recursive checkout stops at these four layers.
`.gitmodules` records their shared URL and tracking branches. Do not merge the
layer branches into `main`; update their submodule pointers instead.

## Clone

```sh
git clone --recurse-submodules https://github.com/TachyonHwang/NUSWorkshopD1.git snip-demo
cd snip-demo
```

The default branch is `main`. A plain clone leaves the submodule folders empty.
To initialize them after a plain clone, run:

```sh
git submodule update --init --recursive
```

## API Contract

The backend defaults to `http://localhost:3000`. A link is:

```json
{
  "code": "Ab12Cd",
  "url": "https://example.com",
  "shortUrl": "http://localhost:3000/Ab12Cd",
  "hits": 0,
  "createdAt": "2026-10-29T00:00:00.000Z"
}
```

| Method | Path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/links` | JSON `{ "url": "https://..." }` | `201`, link object | `400 { "error": "..." }` for invalid JSON or a non-HTTP(S) URL |
| `GET` | `/api/links` | None | `200`, array of link objects | API/network errors are surfaced by clients |
| `GET` | `/:code` | None | `302`, `Location` is the original URL; increments hits | `404` for an unknown code |
| `OPTIONS` | Any path | CORS preflight | `204`, open CORS headers | None under normal operation |

Codes are six random base62 characters. Hits start at zero; `createdAt` is an ISO
timestamp. CORS allows the browser client to use a different origin.

## Run All Three Pieces

Prerequisites: Git, Bun, Node 20.19+ (or a newer Angular 19-compatible Node release),
and npm. The standalone CLI itself only requires Node 18.17+.
Run the following from the aggregator root, using separate terminals.

**Backend, terminal 1:**

```sh
cd backend
bun start
```

`PORT` defaults to `3000`. `BASE_URL` sets the origin in short URLs; otherwise the
server uses `https://$RAILWAY_PUBLIC_DOMAIN` when set, then localhost. Optional
`PUBLIC_DIR` serves static files (`/` maps to `index.html`), with existing files
taking precedence over short codes. No dependency installation is needed.

**Browser client, terminal 2:**

```sh
cd frontend
npm ci
npx ng serve
```

Open `http://localhost:4200`. The client calls `http://localhost:3000`. Paste an
HTTP(S) URL, create a short link, and refresh the table to reload hit counts.
`npx ng build` produces `frontend/dist/snip-frontend/browser` when run from the
frontend directory. Its reusable styling tokens are in `frontend/design.md`.

**CLI client, terminal 3:**

```sh
node cli/cli.js add "https://example.com"
node cli/cli.js ls
node cli/cli.js open Ab12Cd
```

Replace `Ab12Cd` with a code returned by `add` or `ls`. `open` asks the backend for
a redirect without following it, then opens the Location target in the OS browser.
Set `SNIP_API` to use another backend origin. Wrappers are also available:
`./cli/snip`, `cli\snip.cmd`, and `./cli/snip.ps1`. No npm install is needed.

## Update A Layer

A recursive clone normally checks submodules out at detached HEADs. Switch to the
layer's branch before editing. For example, from the aggregator root:

```sh
cd backend
git switch backend
git pull --ff-only origin backend
# Edit and test the backend here.
git add server.js
git commit -m "Improve backend"
git push origin backend
cd ..
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push origin main
```

For other layers, substitute `frontend` or `cli` and stage the appropriate files.
Always push the layer commit **before** the superproject pointer, or other users
cannot fetch the referenced commit. `update --remote` uses the branch specified in
`.gitmodules`; it does not automatically commit the new pointer and may leave the
submodule detached again. Switch branches again before the next edit.

To refresh an existing aggregator clone to its committed, reproducible pointers:

```sh
git pull --ff-only origin main
git submodule update --init --recursive
```

Commit or stash local submodule edits before switching revisions. Use
`git submodule status` to inspect the currently checked-out layer commits.

## Generated Release Bundle

From the main checkout, with Git, Node/npm, and a configured Git author identity:

```sh
node scripts/build-bundle.mjs
node scripts/build-bundle.mjs --push
```

The zero-dependency script updates backend/frontend/cli to their configured
branch tips, runs `npm install` and `ng build`, and requires
`frontend/dist/snip-frontend/browser/index.html`. It copies the backend and CLI
unchanged into `bundle/`, adds the frontend under `bundle/public/`, and generates
the package, Dockerfile, Docker ignore rules, Railway config, and a nonsecret
`.env` containing `PUBLIC_DIR=./public`. The image deliberately includes `.env`
so Bun enables static serving. The package has no `type` field: Bun runs the
server while plain Node can still run the CommonJS CLI.

The bundle branch is generated output: do not hand-edit it. The script refuses
dirty submodules or pre-staged main changes and only stages submodule pointers
in main. It commits generated changes inside bundle first, then commits pointer
bumps in main. Deterministic output and staged-diff checks make an unchanged run
report `nothing to commit` rather than fail. `--push` publishes `HEAD:bundle`
before `HEAD:main`, including local commits from earlier runs; without it, nothing
is pushed. Detached CI checkouts are supported. Diverged bundle histories fail
rather than being force-pushed. npm install must leave source files unchanged;
resolve any dependency-lock update in the frontend branch before retrying.

To run a built bundle, change into `bundle` and run `bun server.js`; open
`http://localhost:3000`. Its CLI is `node cli.js ls`. The current frontend source
still calls `http://localhost:3000`; a remote UI deployment requires an API-origin
change in the frontend branch and a rebuild. No source-layer code is rewritten
by bundling. To deploy only the generated branch, clone with `--branch bundle`
and build its Dockerfile, or point Railway at that branch.