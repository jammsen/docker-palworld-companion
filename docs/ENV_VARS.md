# Environment variables

All variables the companion container understands. The file-and-volume side of the integration (mounts, event-log format, settings-overrides semantics) is documented in [CONTRACT.md](../CONTRACT.md).

## Integration with the gameserver

| Variable            | Function                                                                                                                                     | Default value              | Allowed value |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------- |
| GAME_ROOT           | Mount point of the gameserver's game volume (mount it **read-only** into the companion)                                                       | /palworld                  | Path          |
| COMPANION_DATA_DIR  | The companion's own writable data directory (`state.json`, `companion-events.log`, `settings-overrides.env`)                                  | ${GAME_ROOT}/companion     | Path          |
| RESTAPI_HOST        | Hostname of the gameserver's REST API - the gameserver service name in a compose setup                                                        | 127.0.0.1                  | Hostname      |
| RESTAPI_PORT        | Port of the gameserver's REST API                                                                                                             | 8212                       | UInt16        |
| RESTAPI_ENABLED     | Must be `true` (and on the gameserver too) - without the REST API the companion has no live game data (players, metrics, actions)             | false                      | Boolean       |
| RESTAPI_TIMEOUT     | Timeout in seconds for REST API requests                                                                                                      | 10                         | Integer       |
| ADMIN_PASSWORD      | Shared secret: the gameserver's REST API password, set identically on both containers                                                         |                            | String        |
| SERVER_SETTINGS_MODE | Mirrors the gameserver's mode - the settings editor is writable only in `auto`, read-only otherwise                                          | manual                     | auto, manual  |
| PLAYER_DETECTION_ENABLED | Informational for warnings only: player join/leave/rename events come from the gameserver's player detection via `game-events.log`       | false                      | Boolean       |
| COMPANION_ENV_TEMPLATE | Path of the ordering/comment template for the settings export - by default the gameserver provides it on the game volume at boot; export falls back to schema order when absent | ${GAME_ROOT}/default.env.template | Path |
| COMPANION_DEBUG     | Set to enabled will post companion-service debug messages to the console output                                                               | false                      | Boolean       |

## Web panel

| Variable               | Function                                                                                                                              | Default value | Allowed value |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------- |
| PANEL_ENABLED          | Set to enabled will serve the web operation panel on `PANEL_PORT`, NEEDS `PANEL_PASSWORD` and `RESTAPI_ENABLED`                        | false         | Boolean       |
| PANEL_PORT             | HTTP port of the companion container - `/api/health` is served here even when the panel is disabled                                     | 8213          | UInt16        |
| PANEL_USERNAME         | The login username for the web panel                                                                                                    | admin         | String        |
| PANEL_PASSWORD         | The login password for the web panel - MUST be set to a non-empty value or the panel refuses to start                                   |               | String        |
| PANEL_DEFAULT_LANGUAGE | Default language of the web panel when the browser does not state a preference                                                          | en            | en, zh-CN     |
| PANEL_TRUST_PROXY      | Set to enabled will honor `X-Forwarded-*` headers for login rate-limiting and cookie security - ONLY enable behind a reverse proxy      | false         | Boolean       |

> **Security warning:** The panel speaks plain HTTP and is meant for LAN/VPN use. Do **NOT** publish the panel port directly to the internet - put a reverse proxy with TLS (Caddy, Traefik, nginx) in front of it, or keep it LAN/VPN-only.

- The panel refuses to start while `PANEL_PASSWORD` is empty - there is no default password.
- Settings changed in the panel are stored on the companion data volume in `settings-overrides.env` and survive container restarts and re-creation.
- Setting precedence in `SERVER_SETTINGS_MODE=auto`: template default < environment variable (gameserver `default.env`) < panel override. If a change to your `default.env` seems to be ignored, a panel override likely outranks it - reset that setting in the panel.
- In `SERVER_SETTINGS_MODE=manual` the settings editor is read-only; edit the INI file directly instead.

## Discord live status card

| Variable                       | Function                                                                                                                                                     | Default value                  | Allowed value         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------- |
| DISCORD_STATUS_ENABLED         | Set to enabled will post ONE Discord status-card message and edit it in place, NEEDS `DISCORD_STATUS_WEBHOOK_URL` (or `WEBHOOK_URL`) and `RESTAPI_ENABLED`   | false                          | Boolean               |
| DISCORD_STATUS_WEBHOOK_URL     | Discord webhook url for the status card; if empty, `WEBHOOK_URL` is used                                                                                      |                                | Url                   |
| DISCORD_STATUS_UPDATE_INTERVAL | Interval in seconds between status-card edits; values below 15 are clamped to 15 (webhook rate-limit safety)                                                  | 30                             | Integer               |
| DISCORD_STATUS_EVENT_AMOUNT    | How many entries the status-card last-events log shows; values outside 1-50 are clamped (50 = stored history limit)                                           | 25                             | Integer (1-50)        |
| DISCORD_STATUS_EMOJI_STEAM     | Emoji for Steam players in the status-card player list - see [Platform emojis](#platform-emojis)                                                              | `<:steam:1528444768697192488>` | `<:name:id>` or empty |
| DISCORD_STATUS_EMOJI_XBOX      | Emoji for Xbox players - see [Platform emojis](#platform-emojis)                                                                                              | `<:xbox:1528444823835771020>`  | `<:name:id>` or empty |
| DISCORD_STATUS_EMOJI_PS5       | Emoji for PS5 players - see [Platform emojis](#platform-emojis)                                                                                               | `<:ps5:1528444879695515748>`   | `<:name:id>` or empty |
| DISCORD_STATUS_EMOJI_MAC       | Emoji for Mac players - see [Platform emojis](#platform-emojis)                                                                                               | `<:mac:1528444932132700332>`   | `<:name:id>` or empty |
| DISCORD_STATUS_EMOJI_EVENT_*   | Custom icon per last-events entry. Suffixes: `JOIN`, `LEAVE`, `RENAME`, `ONLINE`, `OFFLINE`, `STARTING`, `INSTALLING`, `UPDATING`, `UPDATING_VALIDATE`, `STOPPING`, `RESTART`, `BACKUP`, `SETTINGS`. Ready-made icon sets ship in [`icons/`](../icons/) - see the README section "Custom event icons" | `icons/modern-slate` tokens    | `<:name:id>` or empty |

### Platform emojis

The Discord status card marks each player in the online list with a platform emoji, detected from the platform prefix of their user id (`steam_...`, `xbox_...`).

> **Caveat about the defaults:** The default `<:name:id>` tokens render from the maintainer's Discord server. Custom emojis in embeds are rendered by id from Discord's CDN, so they work in your channel too - but if those emojis ever get deleted, your card would show raw `<:steam:...>` text instead. For full independence, upload your own platform icons to **the same Discord server your webhook lives in** (Server Settings → Emoji → Upload Emoji), then get each token by typing `\:name:` in a channel and copy it into the variables.

- Set a variable to **empty** to use a neutral colored-square marker instead (🟦 Steam, 🟩 Xbox, 🔹 PS5, ⚪ Mac).
- Invalid token formats are rejected at startup with a warning and fall back to the colored square.
