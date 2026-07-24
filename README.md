# Docker - Palworld Companion

[![Build-Status develop](https://github.com/jammsen/docker-palworld-companion/actions/workflows/docker-build-and-push-develop.yml/badge.svg)](https://github.com/jammsen/docker-palworld-companion/actions/workflows/docker-build-and-push-develop.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/jammsen/palworld-companion)](https://hub.docker.com/r/jammsen/palworld-companion)
[![Discord](https://img.shields.io/discord/532141442731212810?logo=discord&label=Discord&link=https%3A%2F%2Fdiscord.gg%2F7tacb9Q6tj)](https://discord.gg/7tacb9Q6tj)

Companion **sidecar container** for [jammsen/docker-palworld-dedicated-server](https://github.com/jammsen/docker-palworld-dedicated-server): a web operation panel and a Discord live status card for your Palworld dedicated server, running as its own container next to the gameserver.

> **[Join us on Discord](https://discord.gg/7tacb9Q6tj)**

## Features

### Web operation panel

- **Dashboard** - server status, uptime, population, server frame time, server FPS, in-game day, host RAM usage, per-CPU-core load and the last-events log
- **Players** - online players with level/ping/buildings, kick/ban/unban and the ban list
- **Settings editor** - every `PalWorldSettings.ini` value with validation, grouped and translated (English + 中文); saved changes are stored as overrides on the companion volume and applied by the gameserver at its next restart
- **One-click restart** with in-game announce and world save
- Login-protected; sessions survive restarts

![Web panel dashboard showing server status, stat tiles, the last-events log, RAM usage and per-core CPU bars](docs/assets/webpanel-dashboard.png)

### Discord live status card

**One single Discord message** that the companion keeps editing in place - a live status card with uptime, population, server frame time, server FPS, host RAM, per-core CPU bars, last restart, the online player list (with platform icons) and a last-events log. No Discord bot account needed, a plain channel webhook is enough; the message survives container restarts.

![Discord live status card showing uptime, population, frame time, FPS, RAM, in-game day, per-core CPU bars, last restart, the online player list with platform icon and the last-events log](docs/assets/discord-status-card.png)

Ready-made icon sets for the event log ship in [`icons/`](icons/) - see [Custom event icons](#custom-event-icons).

## How it works

The companion talks to the gameserver's REST API over the container network and exchanges files over two **one-way volume mounts** - each container owns exactly one writable surface, the other side mounts it read-only:

- The **game volume** (gameserver-owned): the companion reads `game-events.log`, the generated `PalWorldSettings.ini` and the ban list.
- The **companion data volume** (companion-owned): the panel writes `settings-overrides.env` here; the gameserver reads it at boot and applies the overrides with the highest precedence.

The complete interface is documented in [CONTRACT.md](CONTRACT.md).

## Getting started

Add the companion as a second service next to your gameserver:

```yaml
services:
  palworld-dedicated-server:
    container_name: palworld-dedicated-server
    image: jammsen/palworld-dedicated-server:latest
    # ... your existing gameserver configuration (ports etc.) ...
    env_file:
      # Shared config: RESTAPI_ENABLED=true and ADMIN_PASSWORD in here are
      # required on BOTH services for the companion to reach the REST API
      - ./default.env
    environment:
      COMPANION_DATA_DIR: /companion-data
    volumes:
      - ./game:/palworld
      - companion-data:/companion-data:ro

  companion:
    container_name: palworld-companion
    image: jammsen/palworld-companion:develop
    restart: unless-stopped
    depends_on:
      - palworld-dedicated-server
    ports:
      # Do NOT expose the panel to the internet - LAN/VPN or reverse proxy only
      - target: 8213
        published: 8213
        protocol: tcp
    env_file:
      - ./default.env
    environment:
      RESTAPI_HOST: palworld-dedicated-server
      COMPANION_DATA_DIR: /data
    volumes:
      - ./game:/palworld:ro
      - companion-data:/data

volumes:
  companion-data:
```

Then enable the features you want in your `default.env`:

```shell
# Web panel
PANEL_ENABLED=true
PANEL_PASSWORD=choose-a-strong-password

# Discord live status card
DISCORD_STATUS_ENABLED=true
DISCORD_STATUS_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Both features need `RESTAPI_ENABLED=true` and `ADMIN_PASSWORD` set on the gameserver - the companion uses the same values to reach the REST API.

> **Security warning:** The panel speaks plain HTTP - do **NOT** publish port 8213 to the internet. Use it LAN/VPN-only or put a TLS reverse proxy (Caddy, Traefik, nginx) in front.

All environment variables are documented in [docs/ENV_VARS.md](docs/ENV_VARS.md).

## Custom event icons

The last-events log ships with proper icons out of the box (the `icons/modern-slate` set). To use another set - or your own icons:

1. Pick a set from [`icons/`](icons/) (24 ready-made sets, 13 PNGs each).
2. **Upload the 13 PNGs** to the Discord server your webhook lives in: Server Settings → Emoji → Upload Emoji.
3. **Get each token**: type the emoji with a leading backslash in any channel (e.g. `\:pal_join:`) and send - Discord prints the raw token like `<:pal_join:1234567890123456789>`.
4. Set the matching `DISCORD_STATUS_EMOJI_EVENT_*` variables - see [docs/ENV_VARS.md](docs/ENV_VARS.md).

Any variable left empty keeps its unicode default. The web dashboard keeps the unicode emojis - Discord custom emojis only render inside Discord.

## Development

```bash
npm ci
npm run dev    # tsx watch against .env.example settings
npm run mock   # mock Palworld REST API server for local development
npm test
npm run build  # bundle to dist/companion.mjs
```

The Docker image build runs typecheck, unit tests and the bundle build - a broken test fails the build.
