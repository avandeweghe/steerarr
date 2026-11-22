# Steerarr

A self-hosted, mobile-first control app for an *arr media stack (Sonarr, Radarr, Prowlarr,
NZBGet), installed on a phone's home screen. README.md is the user guide, CONTRIBUTING.md the
developer guide; this file is the detailed reference for working on the code.

## Architecture

One container, one port (6232):

- **backend/**: Node 26 + TypeScript + Fastify 5. Holds the API keys and calls each service's
  API. The *arr apps send no CORS headers, and the keys must stay off the phone. Exposes only
  curated routes under `/api/<service>/...` that return trimmed DTOs. There is no generic
  pass-through.
- **frontend/**: Svelte 5 + Vite 8 SPA (PWA), plain CSS. Talks only to the backend, using
  relative URLs (`api/...` resolved against `document.baseURI`). Hash routing (`#/sonarr/...`).
- **shared/**: TypeScript types only: the API contract (DTOs, `ApiErrorBody`). Both sides
  import it with `import type`, so it never exists at runtime. Keep it types-only.
- npm workspaces at the root, one `package-lock.json`.

### Service-module pattern

Each service is a self-contained module on both sides with the same id (e.g. `sonarr`):

- Services are **set up in the app only** (address + API key), never with env vars. Settings
  live in `<DATA_DIR>/services.json` via `core/settings-store.ts` (`ArrSettingsStore`: kept in
  memory, queued atomic writes, mode 0600; a missing or corrupt file means "not set up").
- Backend `backend/src/services/<id>/`:
  - `index.ts` exports a `ServiceModule` (`id`, `name`, `credentials?`, `createClient(config)`,
    `routes(getClient)`). `credentials: 'login'` (e.g. NZBGet) means a username and password
    instead of an API key: the username is saved as `username`, the password where the key
    would be (`apiKey`), and `ArrClient` sends them as HTTP Basic auth.
  - `client.ts` is a typed client built on `core/ArrClient`, implementing `ArrServiceClient`
    (`getSystemStatus`, used to test a connection). NZBGet's wraps its JSON-RPC API
    (`POST /jsonrpc`, errors in the body with HTTP 200).
  - `routes.ts` maps upstream resources to shared DTOs. Call `getClient()` inside each handler:
    it returns the client for the current settings or throws `NotConfiguredError` (503
    `not_configured`). Never capture a client at registration time. `/settings` is reserved.
  - Every module serves `GET /summary` (`ServiceSummary`: version, short facts, the service's
    own health warnings and errors) for its card on Home. Keep it to a few quick calls.
  - `types.ts` holds the upstream response shapes (only the fields we use), when needed.
  - Register the module in `backend/src/services/index.ts`. `core/arr-service.ts`
    (`registerArrService`) mounts it at `/api/<id>` with the shared settings routes:
    `GET/PUT/DELETE /settings` and `POST /settings/test`.
  - Settings rules: the API key or password is never returned (`apiKeySaved` only). A blank one
    reuses the saved one **only if the normalized address is unchanged**, so a saved secret
    can't be sent to another server. `PUT` tests first unless `force` is set.
- Frontend `frontend/src/services/<id>/`:
  - `index.ts` exports a `FrontendService` (`id`, `name`, tab `icon` path, `credentials?` and
    `credentialsHint` (where to find them in the service), `routes`; the first route is its
    home).
  - `api.ts` holds the typed calls.
  - `pages/*.svelte` holds the screens. Put `SettingsLink` in the home page's `PageHeader`.
  - Register the module in `frontend/src/services/index.ts`.
  - `App.svelte` adds generic routes: `/` (Home, `lib/pages/HomePage`: a card per set-up
    service), `/settings` (Settings: Services, Login, About), `/:service/settings`
    (`lib/pages/SettingsPage`, to add, edit or remove one service) and `/:service` as a setup
    form (`lib/pages/SetupPage`) while a service isn't set up. Services are added from Settings,
    and only set-up services get a tab.
  - `lib/services.svelte.ts` holds the shared services list. Call `loadServices()` after
    settings change.
  - Data kept between visits (e.g. a list shown instantly while it refreshes) must be dropped
    when `services.revision` changes: after a settings change, it may be another server.
  - Sub-pages pass `back` to `PageHeader` for the link above the title. The router restores the
    scroll position when you go back and starts new pages at the top.
- Shared `shared/src/<id>.ts` holds the DTO types, re-exported from `shared/src/index.ts`.

### Backend conventions

- Server config (`PORT`, `LOG_LEVEL`, `TRUST_PROXY`, `DATA_DIR`) comes from env vars in
  `config.ts`, read through `Env` (never `process.env` directly, except in `server.ts`). Blank
  env vars count as unset.
- Upstream failures throw `UpstreamError` (`network` | `timeout` | `http`). `core/errors.ts`
  maps them to `ApiErrorBody` responses:
  - Upstream 401/403 becomes **502 `upstream_auth`, never 401**. The frontend treats a 401
    without a JSON body, redirects and HTML from `/api` as an expired login at a proxy and
    reloads (there's no login proxy today, but keep this working).
  - 3xx becomes a 502 explaining the redirect.
  - 404 with a JSON body stays 404. 404 without one becomes a 502 hinting at a wrong address
    or URL base.
  - Other 4xx pass through as `bad_request` with the upstream message and `details`.
  - 5xx becomes a 502 `upstream_error`, with the service's own message when it sends one.
  - Messages point the user at "Steerarr's settings", never at env vars.
- Our own errors: `BadRequestError` (400) and `NotFoundError` (404), both with the message
  shown as-is, `NotConfiguredError` (503 `not_configured`), and `SettingsWriteError` (500 with a
  "data folder writable?" message).
- The only 401s Steerarr sends are its own login's (`AuthError`: `login_required`,
  `login_failed`), always with a JSON body. Never answer 403, and never answer 401 for anything
  else.
- Optional login (`core/auth.ts`, `auth-store.ts`, `session.ts`), off by default and turned on in
  Settings (`#/settings`):
  - `<DATA_DIR>/auth.json` (mode 0600) holds the username, a scrypt hash of the password and the
    secret that signs session cookies. No file means the login is off; deleting it (and
    restarting) is the documented way back in. An unreadable file keeps everyone out (503
    `login_unavailable`) rather than turning the login off.
  - While it's on, an `onRequest` hook protects every `/api` route by its matched route pattern,
    except `/api/auth/status`, `login` and `logout`. The app's files and `/healthz` stay open.
  - Sessions are stateless signed cookies (`steerarr_session`: HttpOnly, SameSite=Strict, Secure
    over https), valid 400 days (the browsers' limit) and renewed daily, so a device stays
    logged in until it logs out. A new username or password means a new secret, which logs out
    every other device; so does `POST /api/auth/logout-others` (Settings › Login › Log out all
    other devices), which re-issues the calling device's cookie.
  - Any change to the login needs the current password. Failed logins are limited per address
    (10 per 15 minutes, in memory).
  - No new dependencies: crypto and cookies use Node built-ins.
- `core/same-origin.ts` refuses POST/PUT/DELETE under `/api` whose `Origin` names another host (400),
  logged in or not, so other sites' pages can't trigger changes.
- `ArrClient` sends the key only as an `X-Api-Key` header, uses `redirect: 'manual'`, and has a
  15 s default timeout. Never log or return API keys.
- `/healthz` is liveness only and must never call a service, so Swarm doesn't restart
  Steerarr when Sonarr is down.
- TS settings to respect: `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no
  enums or parameter properties), `noUncheckedIndexedAccess`. ESM with `.js` extensions in
  relative imports.
- Tests live in `backend/test/` (vitest). Use `helpers.ts`:
  - `startApp(saved)` builds the app on a temp data folder with optional saved settings.
  - `stubFetch` mocks upstream services. Never call a real service.
  - `cleanup` runs in `afterEach`.

### Frontend conventions

- Theme "ship's helm at night": tokens are in `frontend/src/app.css`.
  - Colors: `--sea` background, `--hull` surfaces, `--rigging` lines, `--sailcloth` text,
    `--fog` secondary text, `--brass` as the only accent.
  - Status colors follow navigation lights: `--starboard` green = ok/downloaded, `--port` red =
    error/missing, `--lantern` amber = warning. Show status with `StatusLamp`.
  - Type: Barlow Semi Condensed (self-hosted via @fontsource, weights 500/600) for titles and
    numbers; the system font for body text.
  - No all-caps labels and no decorative glow, except on status lamps. Use sentence case.
    Error messages say what went wrong and what to check.
- Mobile first: 44 px touch targets (`--tap`), and respect safe areas (`--safe-*`). The bottom
  tab bar has Home, then one tab per set-up service.
- Svelte 5 runes only (`$state`, `$derived`, `$props`). A page component stays mounted when only
  its `params` change, so derive from `params` rather than reading them once.
- Formatting helpers (sizes, ages, dates, plurals) live in `lib/format.ts`.

## Docker workflow

Everything runs in Docker; nothing besides Docker (with the Compose plugin) is installed for
the project.

- **Dev:** `docker compose -f docker-compose.dev.yml up`, then open port 5173.
  - The `deps` service runs `npm install` into named volumes.
  - The `backend` service runs `tsx watch` on 6232.
  - The `frontend` service runs the Vite dev server on 5173 and proxies `/api` to the backend.
  - Optional server config comes from `.env` (copy it from `.env.example`). On Docker Desktop for
    Windows, set `VITE_USE_POLLING=true`.
  - Service settings saved in the app live in the `data` volume, mounted at `/data`.
    `down -v` wipes them.
- **One-off commands:** `docker compose -f docker-compose.dev.yml run --rm --no-deps -T deps <cmd>`.
  Redirect stdin from `/dev/null` when scripting, or `run` swallows the rest of the script.
- **Checks before a PR:** `npm run check` runs prettier, typecheck (tsc + svelte-check) and the
  vitest tests. Also run `npm run build`.
- **Dependency gotchas:** keep TypeScript on `~6.0` (svelte-check doesn't support TS 7 yet).
  npm 11 blocks install scripts unless they're approved (esbuild's postinstall is blocked
  and nothing needs it). Don't approve scripts without a reason.
- **Prod image:** multi-stage `Dockerfile` (`node:26.13.1-alpine3.24`). It runs as `node`
  (uid 1000), serves the API and the built app (`STATIC_DIR=/app/public`) on `PORT`, and has a
  `HEALTHCHECK` on `/healthz`. It's about 290 MB, of which the Node base is 252 MB.
  - Static files: `index.html` and other non-hashed files use `no-cache`; `assets/` is immutable
    for a year; `/api` responses are `no-store`.
  - **No service worker on purpose.** A cached page could hide a proxy's login page if one is
    ever added.
  - `STEERARR_COMMIT` (a build arg CI sets) goes to both the server (`/api/about`) and the app
    build (`VITE_STEERARR_COMMIT`). An open app compares them every minute and on coming back
    into view (`lib/version.svelte.ts`), and shows `UpdateBar` with Reload when they differ.
    Deploys change the API, so an old page can send requests the new server refuses.
  - Icons are generated from `frontend/public/icon.svg` with `npm run icons -w @steerarr/frontend`
    (run it in the container); the PNGs are committed.
- **Deploy examples:** `docker-compose.yml` (builds the image, publishes 6232, data in `./data`)
  and `stack.yml` (Docker Swarm: one replica, `stop-first` updates because one instance owns the
  settings file, no published ports, on an external proxy network). Keep both generic: no
  hostnames, addresses or paths from any particular setup.
- **CI:** `.github/workflows/build.yml`.
  - The `check` job runs `npm ci`, `npm run check` and `npm run build` on Node 26.13.1.
  - The `image` job builds `linux/amd64` with a GHA cache.
  - It publishes to `ghcr.io/<owner>/<repo>` (from `github.repository`). Pushes to `main` give
    `:latest` + `:sha-<short>`; `v*` tags give semver tags; PRs build without pushing.
  - The `cleanup` job then deletes image versions beyond the newest 10. Images are built without
    provenance attestations, so each build is exactly one package version.
  - It uses the repo's `GITHUB_TOKEN` (packages: write), so no secrets need setting up.
  - Pin action majors, checked against the actions' releases. Lint changes with actionlint (in a container).

## Working agreements

- Feature branches and pull requests, small clear commits. Never commit `.env`, the `data`
  folder, API keys, passwords or tokens.
- Build and test in Docker only (the `deps` container); nothing is installed on the host.
- Run `npm run check` and `npm run build` before opening a pull request.
- Never test anything that deletes or changes data on a real service. Tests stub `fetch`; when
  trying the app against real services, stick to reads unless the user says otherwise.
- The app must work behind a reverse proxy: trust proxy headers from private ranges by default,
  and use no hard-coded base URLs.
- Steerarr is meant for a private network. Its login is optional and off by default; don't
  suggest exposing it to the internet.
- Keep the docs and examples generic. Anything specific to one person's deployment belongs in
  their own notes, not in the repository.
- Stacked pull requests: merge in order with merge commits, and retarget the next one to `main`
  (check it took: `gh pr view <n> --json baseRefName`) before deleting the merged branch, since
  GitHub closes pull requests whose base branch is deleted. Older `gh` versions can fail
  `gh pr edit --base` silently; `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -f base=main`
  always works.

## Known quirks

- **Prettier:** CI runs `prettier --check`; run `npm run format` rather than formatting by hand.
  Things that surprised before: a type union that fits after `=` goes there whole; a call that's
  exactly 100 characters joined stays on one line; arrays and imports that fit get joined
  (objects stay expanded); in Svelte, a single text child that fits gets collapsed.
- **Svelte:** don't name a variable `state` in a component: it clashes with the `$state` rune.
- **Sonarr** unmonitors episodes on file delete when its "Unmonitor Deleted Episodes" setting is
  on; Steerarr re-monitors the ones that were monitored. Radarr does the same for movies.
- **Radarr:** wanted lists don't include `movieFile`; the current quality is in
  `statistics.movieFileQualities`. The calendar's series/movie images carry only TMDb's URL, so
  posters there use the unversioned poster route (cached a day instead of a year).
- **Prowlarr:** grabbing posts the result's `guid` and `indexerId` back to `/api/v1/search`, and
  only works while Prowlarr still has the result from a recent search. Search results carry the
  indexer's download URL with its API key: never pass `downloadUrl` to the app.
- **NZBGet:** JSON-RPC at `<address>/jsonrpc` with HTTP Basic auth; errors come back with HTTP
  200 in the body. `editqueue` is called as `[command, 0, argument, id]`. `config` includes
  NZBGet's passwords, so only category names leave the backend. `SUCCESS/PAR` means the par check
  passed, not that anything was repaired.
- **After an update**, an already open page keeps the old code until reloaded (hence the Reload
  bar), and a `stop-first` redeploy makes `/api` briefly unavailable.
