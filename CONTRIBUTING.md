# Contributing to Steerarr

Everything runs in Docker: you don't need Node or anything else on your machine besides Docker
with Compose.

## The dev stack

```bash
cp .env.example .env    # optional, to change defaults
docker compose -f docker-compose.dev.yml up
```

- The app is at http://localhost:5173 (or `http://<docker-host>:5173` from your phone). The
  Vite dev server proxies `/api` to the backend on port 6232.
- The backend (`tsx watch`) and the frontend reload when you edit files.
- Dependencies are installed by the `deps` service into named volumes, so they never mix with
  your host.
- Service settings you save in the dev app live in the `data` volume.
  `docker compose -f docker-compose.dev.yml down -v` removes it.
- On Docker Desktop for Windows, set `VITE_USE_POLLING=true` in `.env` so file changes are seen.

Run one-off commands in the `deps` container:

```bash
docker compose -f docker-compose.dev.yml run --rm --no-deps -T deps npm run check < /dev/null
```

| What                                | Command (inside `deps`)               |
| ----------------------------------- | ------------------------------------- |
| All checks: format, types and tests | `npm run check`                       |
| Fix formatting                      | `npm run format`                      |
| Production build                    | `npm run build`                       |
| Backend tests only                  | `npx vitest run --root backend`       |
| Regenerate icons from `icon.svg`    | `npm run icons -w @steerarr/frontend` |

When scripting `docker compose run`, redirect stdin from `/dev/null`, or it swallows the rest of
the script.

## Before opening a pull request

- Work on a feature branch, with small, clear commits.
- `npm run check` and `npm run build` pass. CI runs them again on the pull request.
- Never commit `.env`, the `data` folder or any API key, password or token.
- New backend behaviour has tests in `backend/test/` (vitest). Tests stub `fetch`: never call a
  real service from a test (see `backend/test/helpers.ts`).

## Architecture

One container, one port (6232):

- **backend/**: Node 26, TypeScript and Fastify 5. It holds the API keys and calls each service's
  API, exposing only curated routes under `/api/<service>/...` that return trimmed DTOs. There's
  no generic pass-through, and keys never reach the browser.
- **frontend/**: a Svelte 5 and Vite single-page app (plain CSS, hash routing), installable as a
  home screen web app. It talks only to the backend, with relative URLs.
- **shared/**: TypeScript types only, the API contract both sides import with `import type`.
- npm workspaces at the root, with one `package-lock.json`.

[CLAUDE.md](CLAUDE.md) is the detailed reference: the service-module pattern, error handling,
the login, backend and frontend conventions, and known quirks of each service's API. It's written
for AI coding assistants but is the most complete description of how the code fits together.

## Adding a service

Each service is a module with the same id (say `lidarr`) in three places. Sonarr is the most
complete one to copy; Prowlarr is a small one. Settings, the setup screen, the "not set up yet"
state and the settings page come for free.

1. **Shared types**: `shared/src/lidarr.ts` holds the DTOs your routes return. Re-export it from
   `shared/src/index.ts`.
2. **Backend**: `backend/src/services/lidarr/`
   - `client.ts`: a typed client built on `core/arr-client.ts`, implementing `ArrServiceClient`
     (`getSystemStatus`, used to test a connection).
   - `routes.ts`: `lidarrRoutes(getClient, preferences)`, mapping upstream data to the shared
     DTOs. Call `getClient()` inside each handler. Serve `GET /summary` for the Home card. Don't
     use `/settings`, which the core owns.
   - `types.ts`: the upstream response shapes, only the fields you use.
   - `index.ts`: the `ServiceModule` (`id`, `name`, `createClient`, `routes`, and
     `credentials: 'login'` for a username and password instead of an API key).
   - Add it to `backend/src/services/index.ts`, and add tests.
3. **Frontend**: `frontend/src/services/lidarr/`
   - `api.ts`, `pages/*.svelte`, and `index.ts` exporting the `FrontendService` (name, tab icon,
     where to find the credentials, routes under `/lidarr` with its home first, and optionally
     `statusPath` and `adds`).
   - Put a `SettingsLink` in the home page's header.
   - Add it to `frontend/src/services/index.ts`. The order there is the tab order.

## CI

`.github/workflows/build.yml` runs on every pull request and push:

| When                                        | What                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Pull request                                | Checks, tests, build and an image build. Nothing is published.               |
| Push to `main`                              | The same, then publishes `ghcr.io/<owner>/<repo>:latest` and `:sha-<short>`. |
| Tag `v1.2.3`                                | Publishes `:1.2.3`, `:1.2` and `:sha-<short>`.                               |
| Manual run (Actions › Build › Run workflow) | Publishes `:sha-<short>`, plus `:latest` on `main`.                          |

After publishing, it deletes image versions beyond the newest 10 to keep registry storage in
check. It uses the repository's own `GITHUB_TOKEN`, so no secrets need setting up. Pin actions
to a major version checked against their releases, and lint workflow changes with
[actionlint](https://github.com/rhysd/actionlint) (it runs in a container).

When pull requests are stacked (one based on another's branch), merge them in order and retarget
the next one to `main` before deleting the merged branch: GitHub closes pull requests whose base
branch is deleted.
