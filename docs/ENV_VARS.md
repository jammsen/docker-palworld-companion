# Environment variables

All variables the companion container understands. The file-and-volume side of the integration (mounts, event-log format, settings-overrides semantics) is documented in [CONTRACT.md](../CONTRACT.md).

## Integration with the gameserver

| Variable            | Function                                                                                                                                     | Default value              | Allowed value |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------- |
| GAME_ROOT           | Mount point of the gameserver's game volume (mount it **read-only** into the companion)                                                       | /palworld                  | Path          |
| PUID                | UserID the service runs as - the container starts as root, chowns `COMPANION_DATA_DIR` to PUID:PGID and drops privileges (same contract as the gameserver image) | 1000    | Integer       |
| PGID                | GroupID the service runs as - see PUID                                                                                                        | 1000                       | Integer       |
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

The card runs in one of two modes: **webhook mode** (a plain channel webhook, no bot account) or **bot mode** (a Discord developer-app bot token - adds an online presence with live player count and the logs channel). Setting `DISCORD_BOT_TOKEN` selects bot mode; see [Bot mode](#bot-mode).

| Variable                       | Function                                                                                                                                                     | Default value                  | Allowed value         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------- |
| DISCORD_STATUS_ENABLED         | Set to enabled will post ONE Discord status-card message and edit it in place, NEEDS a webhook URL or a bot token+channel, and `RESTAPI_ENABLED`             | false                          | Boolean               |
| DISCORD_STATUS_WEBHOOK_URL     | Discord webhook url for the status card (webhook mode); if empty, `WEBHOOK_URL` is used; ignored when bot mode is active                                      |                                | Url                   |
| DISCORD_STATUS_UPDATE_INTERVAL | Interval in seconds between status-card edits; values below the mode minimum are clamped (webhook: 15, bot: 10)                                               | 30                             | Integer               |
| DISCORD_BOT_TOKEN              | Bot token of your Discord application - set to a non-empty value to switch the card to bot mode - see [Bot mode](#bot-mode)                                   |                                | String (secret)       |
| DISCORD_STATUS_CHANNEL_ID      | Channel id for the live card, REQUIRED in bot mode                                                                                                            |                                | Discord id            |
| DISCORD_LOGS_CHANNEL_ID        | Bot mode: channel that receives every server event as its own message (joins/leaves, starts/stops, updates, restarts, backups, settings) - empty disables it  |                                | Discord id            |
| DISCORD_PRESENCE_ENABLED       | Bot mode: show the bot member online with a live activity text ("12/32 players · Day 47")                                                                     | true                           | Boolean               |
| DISCORD_ADMIN_CHANNEL_ID       | Bot mode: moderation slash commands only work in this channel, and it receives an audit line for every admin action (Discord- and panel-triggered, with actor). Channel trust model: whoever can use the commands **in** this channel may moderate - control that via the channel's visibility and Server Settings → Integrations (commands can be granted to roles without Manage Server there). Empty disables restriction and audit | | Discord id |
| DISCORD_GUILD_ID               | Bot mode: your Discord server id - slash commands are registered per guild and stay disabled without it                                                       |                                | Discord id            |
| DISCORD_COMMANDS_ENABLED       | Bot mode: enable the slash commands `/status` `/players` (public) and `/kick` `/ban` `/unban` `/restart` (moderation). Without an admin channel the moderation commands need the **Manage Server** permission; with `DISCORD_ADMIN_CHANNEL_ID` set, being able to use them in that channel is the authorization (re-scope per command in Server Settings → Integrations) | false | Boolean |
| DISCORD_STATUS_EVENT_AMOUNT    | How many entries the status-card last-events log shows; values outside 1-50 are clamped (50 = stored history limit)                                           | 25                             | Integer (1-50)        |
| DISCORD_STATUS_EMOJI_STEAM     | Emoji for Steam players in the status-card player list - see [Platform emojis](#platform-emojis)                                                              | `<:steam:1528444768697192488>` | `<:name:id>` or empty |
| DISCORD_STATUS_EMOJI_XBOX      | Emoji for Xbox players - see [Platform emojis](#platform-emojis)                                                                                              | `<:xbox:1528444823835771020>`  | `<:name:id>` or empty |
| DISCORD_STATUS_EMOJI_PS5       | Emoji for PS5 players - see [Platform emojis](#platform-emojis)                                                                                               | `<:ps5:1528444879695515748>`   | `<:name:id>` or empty |
| DISCORD_STATUS_EMOJI_MAC       | Emoji for Mac players - see [Platform emojis](#platform-emojis)                                                                                               | `<:mac:1528444932132700332>`   | `<:name:id>` or empty |
| DISCORD_STATUS_EMOJI_EVENT_*   | Custom icon per last-events entry. Suffixes: `JOIN`, `LEAVE`, `RENAME`, `ONLINE`, `OFFLINE`, `STARTING`, `INSTALLING`, `UPDATING`, `UPDATING_VALIDATE`, `STOPPING`, `RESTART`, `BACKUP`, `SETTINGS`, `KICK`, `BAN`, `UNBAN` (the last three have unicode defaults only - the shipped icon sets do not include them yet). Ready-made icon sets ship in [`icons/`](../icons/) - see the README section "Custom event icons" | `icons/modern-slate` tokens    | `<:name:id>` or empty |

### Bot mode

What you need before starting: a Discord account that has the **Manage Server** permission on the server the bot should join.

**Step 1 - Create the application**

1. Open <https://discord.com/developers/applications> and log in with your normal Discord account. You land on the **Applications** overview.
2. Click the blue **New Application** button (top right), enter a name - this becomes your bot's name, e.g. `Palworld Status` - accept the developer terms checkbox and click **Create**.
3. Discord may show an **"Are you human?"** captcha - solve it and you land on your application's **General Information** page.

**Step 2 - Get the bot token**

4. In the **left sidebar** click **Bot**.
5. Click **Reset Token** and confirm (Discord may ask for your password or 2FA code). Copy the token - **it is shown only this once**; if you lose it, reset it again.
6. Put it into `DISCORD_BOT_TOKEN` **without quotation marks**, exactly like the other values in `default.env`: `DISCORD_BOT_TOKEN=MTIzNDU2...`. Treat it like a password: anyone who has it controls your bot. The companion never logs it.
7. Make the bot private - it is public by default and there is no reason to leave your server-management bot installable by strangers. This takes two saves in the right order (Discord refuses a private bot that still has a default install link):
   1. Left sidebar → **Installation** → set the **Install Link** dropdown to **None** → **Save Changes**.
   2. Back on the **Bot** page → switch **Public Bot** OFF → **Save Changes**. (Skipping sub-step 1 gets you the validation error "Private application cannot have a default authorization link".)
   This does not affect the invite in step 3 - the OAuth2 URL Generator works independently of the removed default install link.
8. Everything else on the Bot page stays as it is - the companion needs **none** of the privileged intents (the Presence/Server Members/Message Content toggles stay off).

**Step 3 - Invite the bot to your server**

9. In the left sidebar click **OAuth2** and scroll down to the **OAuth2 URL Generator**.
10. Under **Scopes** tick `bot` and `applications.commands`.
11. A **Bot Permissions** box appears below - tick **View Channels**, **Send Messages** and **Embed Links**.
12. Below that, leave the **Integration Type** dropdown on **Guild Install** - that means "the bot joins a server". (User Install would attach the app to your personal account instead - not what we want.)
13. Copy the **Generated URL** at the bottom, open it in a new browser tab, pick your server in the dropdown, click **Continue** and **Authorize** (the permissions from step 11 are listed for confirmation). The bot now appears (offline) in your server's member list.

**Step 4 - Copy the ids**

14. In your normal Discord client, open **User Settings** (gear icon next to your name) → **Developer** (near the bottom of the settings list; older clients had this under "Advanced") → enable **Developer Mode**. This unlocks the "Copy ID" entries used next.
15. Right-click the channel the status card should live in → **Copy Channel ID** → `DISCORD_STATUS_CHANNEL_ID`.
16. Optional: the same way, copy a logs channel id (`DISCORD_LOGS_CHANNEL_ID`) and an admin channel id (`DISCORD_ADMIN_CHANNEL_ID`).
17. For slash commands: right-click your **server name** (top left, above the channel list) → **Copy Server ID** → `DISCORD_GUILD_ID`, and set `DISCORD_COMMANDS_ENABLED=true`.

**Step 5 - Give the bot access to every configured channel**

18. The invite from step 3 grants the bot server-wide View/Send/Embed - that covers channels everyone can see. Any channel with restricted visibility (a private/staff/testing channel) must add the bot explicitly: hover the channel → **Edit Channel** (gear) → **Permissions** → **Add members or roles** → select your bot → allow **View Channel**, **Send Messages**, **Embed Links**. If you skip this, the companion logs `DiscordAPIError[50001]: Missing Access` for that channel.
19. **Category trap:** if you grant the bot its permissions on a **category** instead of the channel, that only works while the channel is **synced** with the category. A channel with its own permission edits stops inheriting - open **Edit Channel → Permissions** and either click **Sync Now** (adopts the category permissions) or add the bot on the channel itself.

**Step 6 - Enable and restart**

20. In your `default.env` set `DISCORD_STATUS_ENABLED=true` plus the values collected above, then run `docker compose up -d`.
21. Watch the companion with `docker compose logs companion -f`: it reports `discord status enabled (bot mode)`, `Discord bot gateway connected as <name>` and (with commands enabled) `Registered 6 slash commands`. The card appears in the status channel within one update interval.
22. Troubleshooting: `Missing Access (50001)` → the bot cannot see that channel, go back to step 5 (including the category trap). `Missing Permissions (50013)` → it sees the channel but may not write/embed there, also step 5. `Unknown Channel (10003)` → the channel id is wrong, re-copy it. A `401` → the token is wrong, reset it on the Bot page. The companion's log appends these hints automatically.

**Step 7 - Give permissions to bot commands (optional)**

Out of the box, `/status` and `/players` are usable by everyone, while the moderation commands (`/kick` `/ban` `/unban` `/restart`) are only visible to members with the **Manage Server** permission. Discord lets you re-scope every command per role, member and channel - and the companion honors that: with an admin channel configured, whoever can use a moderation command **in that channel** is authorized (every action lands in the audit line with the actor's name).

23. In your Discord client, click your **server name** (top left) → **Server Settings** → **Integrations**.
24. Under **Bots and Apps** click your bot (**Manage**). The page lists the registered **Commands**.
25. Click the command you want to delegate, e.g. `/kick` - a **Modify Command Permissions** dialog opens. Under **Role & Member Overrides** click **Add Roles or Members**, pick the role or person, allow (green check) and **Save**. Repeat for each moderation command you want to delegate. Effective immediately, no bot restart - the delegated user may need a client reload (Ctrl+R) before the command picker shows the commands.
26. **Trap:** the "Roles & Members" section at the TOP of the integration page is not enough for the moderation commands. That section is app-wide, and a command that requires **Manage Server** keeps requiring it until the override is added **inside the command's own dialog** (step 25) - Discord's dialog itself says "Members need server permissions to use this command. To override this, add members or roles below."
27. The same dialog also takes per-command **channel** overrides if you want Discord itself to hide a command outside specific channels (the companion's admin-channel refusal applies on top either way).

Notes:

- **Runtime overrides in the web panel:** the panel has its own **Discord** page (menu entry next to Settings). In bot mode it overrides the channel ids, presence, update interval and the commands toggle; in webhook mode the webhook URL and the update interval (stored in `companion-settings.json` on the companion volume; panel override wins over env, empty field = env value). The bot token is deliberately **not** editable in the panel - it stays environment-only.
- Channel ids may overlap in any combination - pointing the logs (or later admin) channel at the card channel works, but the card message will get buried under the message stream (it still updates in place); the companion logs a hint at startup.
- **Switching between webhook and bot mode** leaves the other mode's card message orphaned (a bot cannot edit a webhook's message and vice versa) - delete the old message manually. Both message ids stay stored, so switching back resumes the previous card.
- The gateway connection (presence) needs outbound `wss://gateway.discord.gg`. On restricted networks the card and logs channel keep working over plain HTTPS - only the presence is unavailable.

### Platform emojis

The Discord status card marks each player in the online list with a platform emoji, detected from the platform prefix of their user id (`steam_...`, `xbox_...`).

> **Caveat about the defaults:** The default `<:name:id>` tokens render from the maintainer's Discord server. Custom emojis in embeds are rendered by id from Discord's CDN, so they work in your channel too - but if those emojis ever get deleted, your card would show raw `<:steam:...>` text instead. For full independence, upload your own platform icons to **the same Discord server your webhook lives in** (Server Settings → Emoji → Upload Emoji), then get each token by typing `\:name:` in a channel and copy it into the variables.

- Set a variable to **empty** to use a neutral colored-square marker instead (🟦 Steam, 🟩 Xbox, 🔹 PS5, ⚪ Mac).
- Invalid token formats are rejected at startup with a warning and fall back to the colored square.
