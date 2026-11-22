# Steerarr

A small, self-hosted control app for your \*arr media stack, made for your phone. Install it on
your home screen and keep an eye on Sonarr, Radarr, Prowlarr and NZBGet from one place, without
exposing any of their API keys to the phone.

Steerarr is one container: a Node backend that holds the services' API keys and talks to them,
and a mobile-first web app that only talks to that backend.

## Features

**Home**: a card per service with its version, a few facts (downloads in the queue, missing
episodes or movies, enabled indexers) and its health warnings. Warnings link to the service's
status page.

**Sonarr** (v4)

- Series list with search, a "Monitored only" filter, posters, episode progress and quality
  profile.
- Series page: seasons and episodes, monitor toggles, season and episode searches followed until
  Sonarr finishes, interactive search to pick a release, deleting an episode's file, and deleting
  the series (optionally with its files).
- Add a series from TheTVDB, with a default quality profile you choose in the settings.
- Calendar of monitored episodes from today on, Activity (queue with remove and blocklist,
  history), Wanted (missing and cutoff not met, with Search all) and Status (health checks,
  disk space per root folder, uptime).

**Radarr** (v5 and later)

- Movie list with search, a "Monitored only" filter, posters and Radarr's status badge
  (file quality; downloaded, missing or not out yet).
- Movie page: details, file, monitor toggle, automatic or interactive search, deleting the file,
  and deleting the movie (optionally with its files).
- Add a movie from TMDb, with a default quality profile.
- Calendar of cinema, digital and physical releases, Activity, Wanted and Status.

**Prowlarr**

- Search all your indexers at once (or one), by category, sorted by age, seeders or size, and
  send a result to a download client.
- Indexers (on, off, or paused after failures) and Status.

**NZBGet**

- Queue with pause and resume (all or one), move to top or bottom, change category and delete,
  and the history.

**Also**: optional login, a reload prompt after an update, pull to refresh, and a dark,
phone-sized layout with large touch targets.

## Requirements

- Docker with Compose, on a host that can reach your services. The published image is
  linux/amd64; building it yourself on other platforms should work but isn't tested.
- The services you want to use: Sonarr v4, Radarr v5 or later, Prowlarr, NZBGet. Any subset
  works.

## Quick start

1. Get the code and start it:

   ```bash
   git clone https://github.com/avandeweghe/steerarr.git
   cd steerarr
   docker compose up -d --build
   ```

   This builds the image and starts Steerarr on port **6232**, with its data in `./data`. The
   container runs as uid 1000, so give it that folder first if Docker would create it as
   root: `mkdir -p data && sudo chown 1000:1000 data`.

2. Open `http://<docker-host>:6232`.
3. Open **Settings** (the gear) and tap **Add** next to each service you use (see below).
4. On your phone, open the same address and add it to the home screen: in Safari,
   **Share** › **Add to Home Screen**; in Chrome on Android, **⋮** › **Add to Home screen**.

Before using it outside your own network, read [Security](#security).

## Setting up services

Services are set up in the app, not with environment variables. For each one, enter:

- **Address**: the URL you open the service at, including any URL base, for example
  `http://192.168.1.10:8989` or `https://sonarr.example.com`.
- **Credentials**:
  - Sonarr, Radarr, Prowlarr: the **API key** (in the service: Settings › General › API Key).
  - NZBGet: its **username and password** (Settings › Security › ControlUsername and
    ControlPassword).

**Test connection** checks both, and **Save** tests again first. If the service is down right
now, you can **Save anyway**.

- Keys and passwords never leave the server; the app only shows that one is saved.
- Changing a service's address requires entering the key again, so a saved key can't be sent to
  a different server.
- Sonarr and Radarr's settings pages also have a **Default quality profile** for adding series
  and movies. It's the same on every device.

## Configuration

Server settings are environment variables. All are optional.

| Variable      | Default                          | Meaning                                                                                                                         |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`        | `6232`                           | Port the server listens on.                                                                                                     |
| `HOST`        | `0.0.0.0`                        | Address the server listens on.                                                                                                  |
| `DATA_DIR`    | `/data`                          | Folder for Steerarr's data (service settings, login). Mount a volume here; the container's user (uid 1000) must own it.         |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Which proxies may set `X-Forwarded-*` headers: IPs, CIDRs, those names, or `true` / `false`. The default trusts private ranges. |
| `LOG_LEVEL`   | `info`                           | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.                                                                 |

`STATIC_DIR` (where the built app is served from) is set by the image; leave it alone.

### The data folder

`DATA_DIR` holds:

- `services.json`: each service's address and API key or password (readable by its owner only).
- `auth.json`: the login settings, when the login is on.

Keep it private and include it in your backups. Deleting the folder resets Steerarr.

## Security

**Steerarr is meant for your own network.** It can change your services' settings, delete files
and send downloads, so treat access to it like access to Sonarr itself:

- **Keep it off the internet.** Reach it on your LAN or over a VPN. If you put it behind a
  reverse proxy, don't expose that hostname publicly.
- **Turn on the login** if others share your network: Settings › Login › **Ask for a username
  and password**. It's off by default.
- **Use HTTPS** when going through a reverse proxy, so the login cookie is sent securely.

Steerarr also refuses changing requests (POST, PUT, DELETE) from other websites' pages, and never
returns API keys or passwords to the app.

### Login

- Each device stays logged in until it logs out. Sessions last 400 days (the longest browsers
  keep a cookie) and renew whenever the app is used, so only a device left unused for over a
  year has to log in again.
- **Log out all other devices** (Settings › Login) logs out everywhere but the device you're
  on, for example after losing a phone.
- Changing the username or password logs out every other device. Any change, including turning
  the login off, needs the current password.
- After 10 failed logins in 15 minutes, an address has to wait out the rest of the 15 minutes.
- **Forgot the password?** Delete `auth.json` from the data folder and restart Steerarr. The login
  is then off, and your service settings stay:

  ```bash
  rm ./data/auth.json
  docker compose restart steerarr
  ```

## Running behind a reverse proxy

Steerarr works at the root of its own hostname (e.g. `https://steerarr.example.com`) and uses no
hard-coded base URLs. Point the proxy at port 6232, for example with Caddy:

```caddyfile
steerarr.example.com {
	reverse_proxy steerarr:6232
}
```

If the proxy isn't on a private address, set `TRUST_PROXY` to its address so Steerarr sees the
real client address (used for the login's rate limit) and whether the request was HTTPS.

## Updating

```bash
git pull
docker compose up -d --build
```

Your settings stay in the data folder. An open app shows a **Reload** bar once the new version is
running.

## Running on Docker Swarm

`stack.yml` is an example stack for Docker Swarm: one replica, updated stop-first (one instance
owns the settings file), with no published ports, on an external network your reverse proxy also
joins. Before deploying:

1. Push the image to a registry your nodes can pull from (see [Building the image](#building-the-image)), and set `image:` to it.
2. Create the data folder on storage every node can reach, owned by uid 1000:
   `mkdir -p /srv/steerarr && chown 1000:1000 /srv/steerarr && chmod 700 /srv/steerarr`.
3. Set the network name to your proxy's network.

Then `docker stack deploy -c stack.yml steerarr` (or paste it into a stack manager such as
Portainer).

## Building the image

```bash
docker build -t steerarr .
```

The multi-stage `Dockerfile` builds everything inside Docker; nothing needs installing on the
host. The image runs as the non-root `node` user (uid 1000), serves the API and the app on `PORT`, and has a health check on
`/healthz`. Pass `--build-arg STEERARR_COMMIT=$(git rev-parse HEAD)` to show the commit under
Settings › About and enable the reload prompt.

The included GitHub Actions workflow builds and publishes the image to the GitHub Container
Registry of the repository it runs in (see [CONTRIBUTING.md](CONTRIBUTING.md#ci)).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md): running the dev stack, the checks, the architecture and
how to add a service.

## License

[MIT](LICENSE)
