# LauchManager

Discord bot for the Lauchgrün League of Legends tournament series. Manages teams, players, Fearless Draft tracking, tournament role assignment, and custom game lobby code generation.

## Features

- **Team management** — create/delete teams with linked Discord roles and voice channels
- **Player registry** — register players by Riot ID, link them to Discord accounts
- **Fearless Draft** — automatically track played champions per team across matches; prevent re-picks
- **Auto-scan** — background polling that detects completed matches and updates Fearless lists without manual input
- **Tournament codes** — generate custom game lobby codes per match via the Riot Tournament API (requires Production API key)
- **Nickname sync** — set/reset Discord nicknames to match in-game names across all teams
- **Tournament role** — bulk-assign or remove a tournament role by user ID or username list

---

## Commands

All commands require `Manage Server` or `Administrator` permission.

### Team Management

| Command | Options | Description |
|---|---|---|
| `/createteam` | `name` (req), `role` (opt) | Creates a team, voice channel, and links a Discord role |
| `/deleteteam` | `team` (req), `delete_role` (opt) | Deletes a team, its voice channel, and optionally its role |
| `/listteams` | — | Lists all registered teams and their players |

### Player Management

| Command | Options | Description |
|---|---|---|
| `/addplayer` | `team` (req), `riotid` (req), `member` (opt) | Adds a player to a team by Riot ID |
| `/removeplayer` | `team` (req), `riotid` (req) | Removes a player from a team |
| `/linkdiscord` | `team` (req), `riotid` (req), `member` (req) | Links a Discord user to a registered player |
| `/unlinkdiscord` | `team` (req), `riotid` (req) | Removes the Discord link from a player |

### Fearless Draft

| Command | Options | Description |
|---|---|---|
| `/banned` | `team` (req) | Shows all locked champions for a team |
| `/scangame` | `id` (req) | Scans a match ID and records played champions |
| `/resetteam` | `team` (req) | Clears the Fearless list for one team |
| `/resetall` | `confirm` (req) | Clears all Fearless lists and match history |

### Auto-Scan

| Command | Options | Description |
|---|---|---|
| `/watch status` | — | Shows current auto-scan status |
| `/watch start` | — | Enables background auto-scanning |
| `/watch stop` | — | Disables background auto-scanning |
| `/watch poll` | — | Manually triggers one scan cycle |

### Match & Tournament Codes

| Command | Options | Description |
|---|---|---|
| `/startmatch` | `round` (req), `team_a` (req), `team_b` (req) | Posts a match embed; team captains click to get their lobby code |

### Nickname Sync

| Command | Options | Description |
|---|---|---|
| `/renameall` | `confirm` (req) | Sets all linked players' nicknames to their in-game name |
| `/renameteam` | `team` (req) | Same as above but for one team only |
| `/clearnames` | `confirm` (req) | Resets all linked players' nicknames back to their default Discord username |

### Tournament Role

| Command | Options | Description |
|---|---|---|
| `/tournament_start_id` | `user_id_liste` (req) | Assigns the tournament role to a list of Discord user IDs |
| `/tournament_start_username` | `user_name_liste` (req) | Assigns the tournament role by Discord username |
| `/tournament_stop` | — | Removes the tournament role from every server member |

---

## Setup

### 1. Prerequisites

- Node.js 20+
- pnpm
- A Riot API key ([developer.riotgames.com](https://developer.riotgames.com)) — Production key required for tournament codes

### 2. Install

```bash
pnpm install
```

### 3. Configure

Copy `.env.example` to `.env` and fill in the values:

```env
# Required
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
RIOT_API_KEY=

# Optional (defaults shown)
RIOT_PLATFORM=EUW1
RIOT_REGION=europe
STORAGE_PATH=data/storage.json
NICKNAME_FORMAT={gameName}

# Role & channel IDs
TOURNAMENT_ROLE_ID=
CAPTAIN_ROLE_ID=
MATCHES_CHANNEL_ID=
TEAM_VOICE_CATEGORY_ID=
AUTOSCAN_CHANNEL_ID=

# Auto-scan
AUTOSCAN_ENABLED=false
AUTOSCAN_INTERVAL_SEC=120
AUTOSCAN_MIN_PLAYERS_PER_TEAM=5

# Tournament API
TOURNAMENT_CALLBACK_URL=https://example.com/riot-callback
```

### 4. Run

```bash
# Development
pnpm dev

# Production
pnpm build && pnpm start
```

> **Note:** Slash commands are automatically registered to the configured guild on bot start.

---

## Discord Permissions

The bot requires the following permissions:

- `Manage Roles` — for assigning/removing the tournament role
- `Manage Nicknames` — for nickname sync commands
- `Manage Channels` — for creating/deleting team voice channels
- `View Channels` / `Send Messages` — for posting match embeds

The bot's role must be **above** the tournament role and all team member roles in the server's role hierarchy.

---

## User ID / Username List Format

`/tournament_start_id` and `/tournament_start_username` accept:

- Plain text pasted directly (IDs separated by spaces, commas, or newlines)
- A link to a paste service (Sourcebin, etc.) containing the list

---

## Project Structure

```
src/
├── commands/admin/   # All slash commands
├── events/           # clientReady, interactionCreate
├── lib/              # Discord embeds, Riot API, storage, nicknames, deploy
├── config.ts         # Env var loading
└── types.ts          # Shared types
data/
└── storage.json      # Persistent team/player/match data
```
